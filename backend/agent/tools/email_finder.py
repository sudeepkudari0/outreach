"""
Email pattern generation and SMTP verification.

Given a first name, last name, and domain:
1. Generates 6 common email patterns
2. Verifies each via SMTP handshake (RCPT TO) — no actual email sent
3. Returns the first verified hit, or best guess if server is unverifiable
"""

import asyncio
import logging
import smtplib
import dns.resolver
from typing import Optional

logger = logging.getLogger(__name__)


def generate_email_patterns(first_name: str, last_name: str, domain: str) -> list[str]:
    """
    Generate common email patterns from a person's name and domain.

    Returns 6 patterns:
    - firstname@domain
    - firstname.lastname@domain
    - firstnamelastname@domain
    - f.lastname@domain
    - flastname@domain
    - lastname@domain
    """
    first = first_name.lower().strip()
    last = last_name.lower().strip()
    d = domain.lower().strip()

    if not first or not last or not d:
        logger.warning(f"Incomplete name/domain: first={first!r}, last={last!r}, domain={d!r}")
        return []

    f_initial = first[0]

    return [
        f"{first}@{d}",
        f"{first}.{last}@{d}",
        f"{first}{last}@{d}",
        f"{f_initial}.{last}@{d}",
        f"{f_initial}{last}@{d}",
        f"{last}@{d}",
    ]


def _get_mx_host(domain: str) -> Optional[str]:
    """Look up the MX record for a domain. Returns the primary MX host or None."""
    try:
        records = dns.resolver.resolve(domain, "MX")
        # Pick the one with lowest priority (highest preference)
        mx = sorted(records, key=lambda r: r.preference)
        if mx:
            host = str(mx[0].exchange).rstrip(".")
            logger.info(f"MX for {domain}: {host}")
            return host
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers) as e:
        logger.warning(f"DNS lookup failed for {domain}: {e}")
    except Exception as e:
        logger.warning(f"MX lookup error for {domain}: {e}")
    return None


def _smtp_verify(email: str, mx_host: str, timeout: float = 5.0) -> tuple[bool, str]:
    """
    Check if a mailbox exists via SMTP RCPT TO handshake.

    Returns:
        (exists, status) where status is:
        - "verified" — server confirmed mailbox exists (250)
        - "rejected" — server rejected the address (550, etc.)
        - "catch_all" — server accepts everything (returns 250 for garbage too)
        - "error" — connection or protocol error
    """
    try:
        smtp = smtplib.SMTP(timeout=timeout)
        smtp.connect(mx_host, 25)
        smtp.helo("outreach-check.local")

        # Use a throwaway sender
        smtp.mail("verify@outreach-check.local")

        code, message = smtp.rcpt(email)
        logger.info(f"RCPT TO {email}: {code} {message}")

        smtp.quit()

        if code == 250:
            return True, "verified"
        elif code == 550 or code == 551 or code == 553:
            return False, "rejected"
        else:
            return False, f"smtp_{code}"

    except smtplib.SMTPServerDisconnected:
        logger.warning(f"SMTP server disconnected for {email}")
        return False, "error"
    except smtplib.SMTPConnectError as e:
        logger.warning(f"SMTP connect error for {mx_host}: {e}")
        return False, "error"
    except TimeoutError:
        logger.warning(f"SMTP timeout for {email}")
        return False, "error"
    except Exception as e:
        logger.warning(f"SMTP error for {email}: {e}")
        return False, "error"


def _is_catch_all(mx_host: str, domain: str, timeout: float = 5.0) -> bool:
    """
    Check if the mail server is a catch-all (accepts any address).
    If it accepts a random garbage address, it's a catch-all.
    """
    garbage_email = f"xyznonexistent92847@{domain}"
    try:
        smtp = smtplib.SMTP(timeout=timeout)
        smtp.connect(mx_host, 25)
        smtp.helo("outreach-check.local")
        smtp.mail("verify@outreach-check.local")

        code, _ = smtp.rcpt(garbage_email)
        smtp.quit()

        if code == 250:
            logger.info(f"Catch-all detected for {domain} (accepts garbage)")
            return True
        return False
    except Exception:
        return False


async def verify_email_smtp(email: str, mx_host: str, timeout: float = 5.0) -> tuple[bool, str]:
    """
    Verify an email via SMTP in a thread pool (smtplib is blocking).
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _smtp_verify, email, mx_host, timeout)


async def find_email(
    full_name: str, domain: str
) -> tuple[Optional[str], str]:
    """
    Find a verified email for the given person at the given domain.

    Returns:
        (email, status) where status is one of:
        - "verified" — SMTP confirmed the email exists
        - "best_guess" — server is catch-all or unverifiable, returning most likely pattern
        - "not_found" — all emails rejected
    """
    parts = full_name.strip().split()
    if len(parts) < 2:
        logger.warning(f"Cannot split name into first/last: {full_name!r}")
        return None, "not_found"

    first_name = parts[0]
    last_name = parts[-1]

    patterns = generate_email_patterns(first_name, last_name, domain)
    if not patterns:
        return None, "not_found"

    # Step 1: Resolve MX record
    loop = asyncio.get_event_loop()
    mx_host = await loop.run_in_executor(None, _get_mx_host, domain)

    if not mx_host:
        # No MX record — can't verify, return best guess
        best_guess = patterns[1]  # firstname.lastname@domain
        logger.info(f"No MX record for {domain}, returning best guess: {best_guess}")
        return best_guess, "best_guess"

    # Step 2: Check for catch-all server
    catch_all = await loop.run_in_executor(None, _is_catch_all, mx_host, domain)

    if catch_all:
        best_guess = patterns[1]  # firstname.lastname@domain
        logger.info(f"Catch-all server, returning best guess: {best_guess}")
        return best_guess, "best_guess"

    # Step 3: Verify each pattern sequentially, stop at first hit
    for email in patterns:
        logger.info(f"Verifying: {email}")
        exists, status = await verify_email_smtp(email, mx_host)

        if exists:
            logger.info(f"✓ Verified email: {email}")
            return email, "verified"

        if status == "error":
            # If connection is failing, don't bother with the rest
            logger.warning(f"SMTP errors — falling back to best guess")
            best_guess = patterns[1]
            return best_guess, "best_guess"

    logger.warning("All patterns rejected by SMTP")
    return None, "not_found"
