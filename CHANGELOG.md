# JWT-Lens Changelog

## [Token Status & Signature Verification] - 2026-10-04

- Added a status row showing whether the token is valid, expired or not valid yet, plus its lifetime
- Added signature verification with a secret, public key, certificate, JWK / JWKS or discovery URL
- Added relative times for timestamp claims and short descriptions for registered claims
- Added actions to copy the token, the signature and timestamps as ISO dates, and to reload from the clipboard
- Scopes and array claims are now shown as separate tags, object claims as JSON
- Unsigned tokens (`alg: none`) are now highlighted

## [Added] - 2026-04-08

- Initial release of the jwt decoder raycast extension
