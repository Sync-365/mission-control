# Sync365 URL migration matrix approval

Date: 2026-04-28
Project: Sync 365 Website rebuild
Reviewer: Alphi SEO
Owner confirmation: Leon confirmed final decisions in task comments.
Source matrix: `data/sync365-url-migration-matrix-2026-04-28.csv`

## Approval status
Approved for build planning and homepage-first implementation.

## Final scope lock / protected routes
The following route remains explicitly out of scope for the marketing-site rebuild and must remain untouched unless a separate task is opened:

- `https://account.sync365license.com/login.php`

Implementation rule:
- preserve access to this route
- do not replatform, rename, redirect, or redesign it as part of Astro/Apostrophe build work
- keep a menu/path for users to reach WHMCS login from the marketing site

## Owner-confirmed route decisions
Leon confirmed the following:

1. **`/index.php?rp=/store/sync-365-license`**
   - legacy/unused
   - not needed in the rebuild
   - should be retired rather than treated as a protected route

2. **`/index.php?rp=/login`**
   - legacy/unused
   - not needed in the rebuild
   - should be retired rather than treated as a protected route

3. **`https://account.sync365license.com/login.php`**
   - active WHMCS login destination
   - should stay reachable from the site menu
   - remains untouched by the marketing rebuild

4. **`/eventlanding/`**
   - no longer needed
   - should be retired in the rebuild

5. **`/enduserportal/`**
   - should be a real marketing page in the new site

6. **NOINDEX placeholder/resource pages**
   - agreed to keep as `NOINDEX`
   - some are placeholders waiting for future content

## Matrix decision summary
- KEEP decisions are approved for the high-value product, legal, post, and `enduserportal` marketing routes.
- REDIRECT decisions are approved for duplicate, placeholder, persona/framework, legacy query-string, and now-unused legacy app routes.
- NOINDEX decisions are approved for thin/campaign/scaffold pages that should not compete in search until properly built.

## Remaining follow-up items
These do not block build start, but still need implementation choices:

1. **Final redirect target for `/eventlanding/`**
   - Recommendation: redirect to `/` unless a more relevant campaign replacement exists.

2. **Final redirect target for legacy unused routes**
   - `/index.php?rp=/store/sync-365-license`
   - `/index.php?rp=/login`
   - Recommendation: decide during redirect implementation whether both should go to `/`, `/contact-sync/`, or the WHMCS login/store destination.

## Reviewer note
This decision gate is now satisfied: the matrix is approved, the active WHMCS login route is explicitly protected, the unused legacy routes are explicitly retired, and unresolved redirect-target choices are captured for follow-up.
