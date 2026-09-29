import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import AuthenticatedUser, DBSession, RequireSuperadmin
from app.models.enums import RoleEnum
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UnlockAccountRequest,
    ResendUnlockEmailRequest,
)
from app.schemas.common import MessageResponse
from app.services import auth_service, password_reset_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/unlock-account", response_model=MessageResponse)
async def unlock_account_endpoint(data: UnlockAccountRequest, db: DBSession):
    """
    Unlock a temporarily locked account using a one-time cryptographic token sent via email.
    Clears lockout, failed login counters, and OTP window rate limits.
    """
    result = await password_reset_service.unlock_account_by_token(data.token, db=db)
    return MessageResponse(message=result["message"])


@router.post("/resend-unlock-email", response_model=MessageResponse)
async def resend_unlock_email_endpoint(data: ResendUnlockEmailRequest):
    """
    Resend an instant unlock email if the account is currently locked.
    Enforces a 60-second cooldown.
    """
    result = await password_reset_service.resend_account_unlock_email(data.email)
    return MessageResponse(message=result["message"])


@router.post("/forgot-password/request-otp", response_model=ForgotPasswordResponse)
async def forgot_password_request_otp(data: ForgotPasswordRequest, db: DBSession):
    """
    Request a 6-digit verification code to reset password.
    Enforces a 1-minute cooling period and max 5 requests per 15-minute window.
    """
    result = await password_reset_service.request_password_reset_otp(db, data.email)
    return ForgotPasswordResponse(**result)


@router.post("/forgot-password/reset-password", response_model=MessageResponse)
async def forgot_password_reset(data: ResetPasswordRequest, db: DBSession):
    """
    Verify 6-digit OTP and reset password.
    Enforces 5 max wrong attempts before the code expires.
    Immediately clears account lockout upon successful reset.
    """
    result = await password_reset_service.verify_and_reset_password(
        db, data.email, data.otp, data.new_password
    )
    return MessageResponse(message=result["message"])


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """
    Register a new admin user — protected endpoint for Superadmin.
    """
    if data.role != RoleEnum.SUPERADMIN and not data.outlet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="outlet_id is required when creating an outlet admin account",
        )

    await auth_service.register_user(db, data)
    return MessageResponse(message="User registered successfully")


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: DBSession):
    """Authenticate and receive access + refresh tokens."""
    return await auth_service.login_user(db, data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: DBSession):
    """Rotate refresh token and get new access + refresh tokens."""
    return await auth_service.refresh_tokens(db, data.refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: AuthenticatedUser, db: DBSession):
    """Revoke refresh token."""
    await auth_service.logout_user(db, current_user.user_id)
    return MessageResponse(message="Logged out successfully")


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """
    Delete an admin user account — protected endpoint for Superadmin.
    """
    if current_user.user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own active account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found",
        )

    # 2-step safeguard: Must be deactivated first
    if target_user.is_active or target_user.status == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only deactivated staff members can be permanently deleted. Please deactivate the member first.",
        )

    user_name = target_user.name
    user_email = target_user.email
    target_outlet_id = target_user.outlet_id

    await db.delete(target_user)
    await db.flush()

    if target_outlet_id:
        from app.services.staff_service import create_staff_audit_log
        await create_staff_audit_log(
            db,
            outlet_id=target_outlet_id,
            staff_id=None,
            action_type="staff_permanently_deleted",
            reference_type="User",
            reference_id=str(user_id),
            details=f"Permanently deleted user '{user_name}' ({user_email}) by Superadmin",
        )

@router.post("/impersonate/{outlet_id}", response_model=TokenResponse)
async def impersonate_outlet(
    outlet_id: uuid.UUID,
    current_user: RequireSuperadmin,
    db: DBSession,
):
    """
    Generate a new access token that acts as SUPERADMIN but scoped to a specific outlet_id.
    """
    from app.models.outlet import Outlet
    from app.core.security import create_access_token, create_refresh_token
    
    result = await db.execute(select(Outlet).where(Outlet.id == outlet_id))
    outlet = result.scalar_one_or_none()
    
    if not outlet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Outlet not found",
        )

    access_token = create_access_token(
        user_id=current_user.user_id,
        outlet_id=outlet_id,
        role=RoleEnum.SUPERADMIN.value,
        expires_delta=timedelta(hours=12),
    )
    refresh_token = create_refresh_token(
        user_id=current_user.user_id,
        outlet_id=outlet_id,
        role=RoleEnum.SUPERADMIN.value,
        expires_delta=timedelta(hours=24),
    )

    user_res = await db.execute(select(User).where(User.id == current_user.user_id))
    user_obj = user_res.scalar_one()

    from app.services.staff_service import to_staff_response
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=RoleEnum.SUPERADMIN.value,
        user=to_staff_response(user_obj)
    )
