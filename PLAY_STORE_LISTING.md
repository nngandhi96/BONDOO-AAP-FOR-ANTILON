# Google Play Store Listing & Setup Guide for Bondoo

Yeh guide aapko Google Play Console me required sari details aur texts provide karti hai.

---

## 1. Store Listing Details (Copy & Paste)

### App Name (Max 30 characters)
```text
Bondoo: Connect & Meet
```

### Short Description (Max 80 characters)
```text
Discover verified connections, meet new people safely, and bond in real life.
```

### Full Description (Max 4000 characters)
```text
Welcome to Bondoo — The modern, verified way to connect with real people and build genuine connections.

Bondoo is designed to bring trust, safety, and authentic interactions back to social discovery. Whether you want to make new friends, find like-minded people, or meet verified companions in real life, Bondoo gives you a secure and seamless platform.

Key Features:
• Verified Profiles: Connect with real, verified community members.
• Safety First: Built-in instant user blocking, reporting, and moderation controls.
• Seamless Authentication: Fast and secure email OTP verification to protect your account.
• Privacy by Design: Control your profile visibility and manage your personal data with complete transparency.
• Instant Account Control: Easy in-app account deletion anytime you choose.

How Bondoo Works:
1. Quick Sign-Up: Register using your secure email OTP.
2. Complete Your Profile: Add your bio, photos, and preferences.
3. Discover & Connect: Find authentic members nearby or based on your interests.
4. Meet Safely: Bond in real life with peace of mind.

Safety & Community Guidelines:
Bondoo is exclusively for individuals aged 18 and older. We maintain a zero-tolerance policy for harassment, impersonation, hate speech, or illicit behavior.

Privacy Policy: https://bondoo-connect-main.vercel.app/privacy
Terms of Service: https://bondoo-connect-main.vercel.app/terms
Support Email: support@bondoo.com (or your contact email)
```

---

## 2. Policy & App Content URLs

Jab Google Play Console aapse policy links mangega:
- **Privacy Policy URL**: `https://bondoo-connect-main.vercel.app/privacy`
- **Terms of Service URL**: `https://bondoo-connect-main.vercel.app/terms`
- **Account Deletion URL**: `https://bondoo-connect-main.vercel.app/privacy#account-deletion`
- **Target Age**: 18 and over (Select 18+ only)

---

## 3. Data Safety Form Answers (Google Play Questionnaire)

Play Console me **Data Safety** section me yeh tick karein:
1. **Does your app collect or share user data?** -> **Yes**
2. **Is all user data encrypted in transit?** -> **Yes** (HTTPS/TLS)
3. **Do you provide a way for users to request their data be deleted?** -> **Yes** (In-app delete account feature profile me available hai)
4. **Data types collected**:
   - **Personal Info**: Name, Email address, User IDs (Account functionality & App security).
   - **Photos**: Photos uploaded for profile (Profile customization).
   - **Messages / Interactions**: In-app messages/activity (App functionality).
   - **Approximate Location**: (Agar location enabled hai).

---

## 4. Automatic Cloud Build (GitHub Actions)

Aapko PC par heavy Android Studio install karne ki zaroorat nahi hai:
1. Jab aap code push karenge, GitHub automatically build karega:
   - **Debug APK** (`app-debug.apk`): Isse download karke phone me install karke test karein.
   - **Release AAB** (`app-release.aab`): Isse Google Play Console me upload karein.
2. Download karne ke liye:
   - Apne GitHub repo me jayein: `https://github.com/nngandhi96/BONDOO-AAP-FOR-ANTILON`
   - **Actions** tab par click karein.
   - Latest successful build par click karein.
   - Niche **Artifacts** section se `bondoo-debug-apk` ya `bondoo-release-aab` download kar lein!
