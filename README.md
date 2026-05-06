# SupplyPro - Portal de Pedidos

React + Firebase + Vite app, ready for GitHub and Vercel.

## Important security note

Do not commit real Firebase values in `.env.example` or any other tracked file.
Use `.env.local` locally and Vercel Environment Variables in production.

If a real key was previously committed, rotate or restrict it in Google Cloud Console.
At minimum, restrict the API key to your Vercel/custom domains using HTTP referrers.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then edit `.env.local` with your real Firebase values.

## Vercel setup

1. Upload this folder to GitHub.
2. Import the GitHub repo in Vercel.
3. Add the real values in Vercel > Project Settings > Environment Variables.
4. Build command: `npm run build`.
5. Output directory: `dist`.

Required Vercel environment variables:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_APP_ID=produccion
```

## Firebase notes

Enable Anonymous sign-in in Firebase Authentication.
The app uses Firestore paths under:

`artifacts/produccion/public/data/...`

For production, tighten Firestore rules and avoid relying on PINs as the only access control.
