/**
 * UI strings. Indonesian is the default (target market); English is the
 * alternative. Add a key to `en` first; `id` must have the same keys.
 */
export const en = {
  "lang.label": "Language",
  "lang.id": "ID",
  "lang.en": "EN",
  "nav.discover": "Discover",
  "nav.likes": "Likes",
  "nav.matches": "Matches",
  "nav.chats": "Chats",
  "nav.profile": "Profile",
  "nav.settings": "Settings",
  "nav.admin": "Admin",
  "nav.notifications": "Notifications",
  "auth.welcomeBack": "Welcome back",
  "auth.welcomeSub": "Good to see you. Let's find your spark.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.forgot": "Forgot password?",
  "auth.logIn": "Log in",
  "auth.newHere": "New to SPARK?",
  "auth.createAccount": "Create an account",
  "auth.invalidLink": "That link is invalid or has expired.",
  "auth.googleFailed": "Google sign-in was cancelled or failed.",
  "auth.verified": "Email verified — sign in to continue.",
  "auth.wrongCredentials": "That email and password don't match.",
} as const;

export type MessageKey = keyof typeof en;

export const id: Record<MessageKey, string> = {
  "lang.label": "Bahasa",
  "lang.id": "ID",
  "lang.en": "EN",
  "nav.discover": "Temukan",
  "nav.likes": "Suka",
  "nav.matches": "Match",
  "nav.chats": "Chat",
  "nav.profile": "Profil",
  "nav.settings": "Pengaturan",
  "nav.admin": "Admin",
  "nav.notifications": "Notifikasi",
  "auth.welcomeBack": "Selamat datang kembali",
  "auth.welcomeSub": "Senang melihatmu lagi. Yuk temukan spark-mu.",
  "auth.email": "Email",
  "auth.password": "Kata sandi",
  "auth.forgot": "Lupa kata sandi?",
  "auth.logIn": "Masuk",
  "auth.newHere": "Baru di SPARK?",
  "auth.createAccount": "Buat akun",
  "auth.invalidLink": "Tautan ini tidak valid atau sudah kedaluwarsa.",
  "auth.googleFailed": "Masuk dengan Google dibatalkan atau gagal.",
  "auth.verified": "Email terverifikasi — masuk untuk melanjutkan.",
  "auth.wrongCredentials": "Email dan kata sandi tidak cocok.",
};
