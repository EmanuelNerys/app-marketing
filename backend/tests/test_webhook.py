"""
Tests for webhook signature validation and event routing.
"""
import hashlib
import hmac
import json
import pytest

from app.routes.webhook import _verify_signature


# ---------------------------------------------------------------------------
# Signature validation
# ---------------------------------------------------------------------------

APP_SECRET = "test_app_secret"


def _make_signature(body: bytes, secret: str = APP_SECRET) -> str:
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def test_valid_signature():
    body = b'{"object":"instagram","entry":[]}'
    sig = _make_signature(body)
    assert _verify_signature(body, sig) is True


def test_invalid_signature_wrong_secret():
    body = b'{"object":"instagram","entry":[]}'
    sig = _make_signature(body, secret="wrong_secret")
    assert _verify_signature(body, sig) is False


def test_invalid_signature_tampered_body():
    body = b'{"object":"instagram","entry":[]}'
    sig = _make_signature(body)
    tampered = b'{"object":"instagram","entry":[{"id":"evil"}]}'
    assert _verify_signature(tampered, sig) is False


def test_missing_sha256_prefix():
    body = b'{"object":"instagram"}'
    # header without "sha256=" prefix
    bare_hex = hmac.new(APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert _verify_signature(body, bare_hex) is False


def test_empty_signature_header():
    body = b'{"object":"instagram"}'
    assert _verify_signature(body, "") is False


# ---------------------------------------------------------------------------
# GET verification challenge
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_verify_challenge(client):
    resp = await client.get(
        "/api/v1/webhook/meta",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "test_verify_token",
            "hub.challenge": "12345",
        },
    )
    assert resp.status_code == 200
    assert resp.json() == 12345


@pytest.mark.asyncio
async def test_webhook_verify_wrong_token(client):
    resp = await client.get(
        "/api/v1/webhook/meta",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "12345",
        },
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST — signature enforcement
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_post_rejects_unsigned(client):
    payload = json.dumps({"object": "instagram", "entry": []}).encode()
    resp = await client.post(
        "/api/v1/webhook/meta",
        content=payload,
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_webhook_post_accepts_signed(client):
    payload = json.dumps({"object": "instagram", "entry": []}).encode()
    sig = _make_signature(payload)
    resp = await client.post(
        "/api/v1/webhook/meta",
        content=payload,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "received"}
