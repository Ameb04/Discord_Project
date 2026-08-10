"""Bridging helpers between the service layer and DRF views."""

from contextlib import contextmanager

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import PermissionDenied, ValidationError


def validation_error_detail(error):
    """Flatten a Django ValidationError into something DRF can render."""
    if hasattr(error, "message_dict"):
        return error.message_dict
    if hasattr(error, "messages"):
        return error.messages
    return str(error)


@contextmanager
def domain_errors():
    """Translate service-layer Django exceptions into DRF ones.

    Services raise plain Django ``ValidationError`` / ``PermissionDenied`` so
    they stay callable outside the API — Celery tasks, management commands,
    tests. This is the one place that maps those onto HTTP status codes.
    """
    try:
        yield
    except DjangoValidationError as exc:
        raise ValidationError(validation_error_detail(exc)) from exc
    except DjangoPermissionDenied as exc:
        raise PermissionDenied(str(exc)) from exc
