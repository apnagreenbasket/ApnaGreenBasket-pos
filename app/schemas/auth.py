"""
Auth schemas — login, register, token responses.
"""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import RoleEnum
from app.schemas.staff import StaffResponse


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    outlet_id: uuid.UUID | None = None


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = None
    phone: str | None = Field(default=None, max_length=50)
    pin: str | None = Field(default=None, pattern=r"^\d{4}$")
    role: RoleEnum = RoleEnum.STAFF
    outlet_id: uuid.UUID | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            digits = "".join(c for c in v if c.isdigit())
            if len(digits) < 10:
                raise ValueError("Phone number must contain at least 10 digits")
            if len(digits) > 15:
                raise ValueError("Phone number cannot exceed 15 digits")
            return v
        return v


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str = "STAFF"
    user: StaffResponse | None = None


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordResponse(BaseModel):
    message: str
    cooldown_seconds: int = 60
    email_masked: str | None = None


class UnlockAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1)


class ResendUnlockEmailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


