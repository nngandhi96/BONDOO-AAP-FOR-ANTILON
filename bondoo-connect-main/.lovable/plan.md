
## Goal
जब कोई user को नया **message**, **connection request**, या **meetup update (propose / confirm / reschedule / cancel)** मिले, तो उसे real-time push notification मिले — भले ही Bondoo tab बंद हो। पहले step में **Web Push (PWA)** — Capacitor/Android push दूसरे step में।

## Approach — Web Push with VAPID (no Firebase)
Standards-based Web Push API works in Chrome/Edge/Firefox/Android Chrome और iOS 16.4+ (PWA installed) पर — Lovable Cloud के साथ पूरी तरह compatible है, कोई third-party SDK नहीं चाहिए। Capacitor Android layer बाद में इसी infra को FCM के ज़रिए reuse कर सकता है।

## Scope of this plan
1. **VAPID keys** — `VAPID_PUBLIC_KEY` (client + code में safe), `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT` (mailto)। `generate_secret` से मिंट होंगे।
2. **DB table `push_subscriptions`** — `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, timestamps। RLS: owner-only।
3. **Service worker** `public/sw.js` (push-only, no offline caching — PWA skill के मुताबिक):
   - `push` event → `showNotification` (title, body, icon, `data.url`)
   - `notificationclick` → focus / open Bondoo पर सही URL
4. **Client hook `usePushNotifications`** + Profile settings toggle "Enable notifications":
   - Permission request, service worker register, `pushManager.subscribe`, subscription को server पर save
   - Unsubscribe flow भी
5. **Server functions** (`src/lib/push.functions.ts`):
   - `savePushSubscription` / `deletePushSubscription`
   - `sendPushToUser(userId, payload)` — internal helper, VAPID-signed Web Push protocol call (pure fetch, कोई npm addon नहीं — Worker-safe)
6. **Trigger points** — इनको modify करके recipient को push भेजें:
   - `chat.functions.ts` → new message → recipient को "New message from X"
   - `connections.functions.ts` → request बनने पर + accept होने पर
   - `meetups.functions.ts` → propose / confirm / decline / reschedule / cancel
7. **UI**: Profile page पर "Notifications" section — Enable/Disable button + browser support/permission state।

## Out of scope (अलग step में)
- Capacitor/Android native push (FCM setup, `google-services.json`, `@capacitor/push-notifications`)
- iOS APNs
- Notification preferences per-category
- In-app notification center / history

## Technical notes
- Web Push signing: VAPID JWT (ES256) — Web Crypto API के साथ pure JS में sign होगा, कोई Node-only lib नहीं।
- iOS Safari push सिर्फ़ tab में install हुए PWA में काम करता है — UX में "Add to Home Screen for iPhone" hint।
- Push send **fire-and-forget** — किसी trigger action को block नहीं करेगा; अगर subscription 404/410 दे तो row silently delete।
- No secrets or endpoint data user को expose नहीं होगा।

Confirm करें तो VAPID keys mint करके implementation शुरू करता हूँ।
