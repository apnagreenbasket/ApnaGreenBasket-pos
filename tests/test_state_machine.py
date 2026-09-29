"""
State machine unit tests — validate the transition map directly.
"""

from __future__ import annotations

import pytest

from app.models.enums import OrderStatusEnum, is_valid_transition, VALID_ORDER_TRANSITIONS


class TestStateMachine:
    """Order status state machine tests."""

    def test_pending_to_paid_valid(self):
        assert is_valid_transition(OrderStatusEnum.PENDING, OrderStatusEnum.PAID)

    def test_pending_to_pending_verification_valid(self):
        assert is_valid_transition(OrderStatusEnum.PENDING, OrderStatusEnum.PENDING_VERIFICATION)

    def test_pending_to_cancelled_valid(self):
        assert is_valid_transition(OrderStatusEnum.PENDING, OrderStatusEnum.CANCELLED)

    def test_pending_verification_to_paid_valid(self):
        assert is_valid_transition(OrderStatusEnum.PENDING_VERIFICATION, OrderStatusEnum.PAID)

    def test_paid_to_payment_pending_valid(self):
        assert is_valid_transition(OrderStatusEnum.PAID, OrderStatusEnum.PAYMENT_PENDING)

    def test_paid_to_refunded_valid(self):
        assert is_valid_transition(OrderStatusEnum.PAID, OrderStatusEnum.REFUNDED)

    def test_payment_pending_to_completed_valid(self):
        assert is_valid_transition(OrderStatusEnum.PAYMENT_PENDING, OrderStatusEnum.COMPLETED)

    # Invalid transitions
    def test_completed_to_pending_invalid(self):
        assert not is_valid_transition(OrderStatusEnum.COMPLETED, OrderStatusEnum.PENDING)

    def test_completed_to_paid_invalid(self):
        assert not is_valid_transition(OrderStatusEnum.COMPLETED, OrderStatusEnum.PAID)

    def test_cancelled_to_anything_invalid(self):
        for target in OrderStatusEnum:
            assert not is_valid_transition(OrderStatusEnum.CANCELLED, target)

    def test_refunded_to_anything_invalid(self):
        for target in OrderStatusEnum:
            assert not is_valid_transition(OrderStatusEnum.REFUNDED, target)

    def test_payment_pending_to_pending_invalid(self):
        assert not is_valid_transition(OrderStatusEnum.PAYMENT_PENDING, OrderStatusEnum.PENDING)

    def test_paid_to_pending_invalid(self):
        assert not is_valid_transition(OrderStatusEnum.PAID, OrderStatusEnum.PENDING)

    def test_all_terminal_states_have_no_transitions(self):
        terminal = [OrderStatusEnum.CANCELLED, OrderStatusEnum.REFUNDED]
        for state in terminal:
            assert VALID_ORDER_TRANSITIONS[state] == set()

    def test_completed_transitions_to_returns(self):
        assert is_valid_transition(OrderStatusEnum.COMPLETED, OrderStatusEnum.PARTIALLY_REFUNDED)
        assert is_valid_transition(OrderStatusEnum.COMPLETED, OrderStatusEnum.REFUNDED)
        assert not is_valid_transition(OrderStatusEnum.COMPLETED, OrderStatusEnum.CANCELLED)
