# SupplyPro - Portal de Pedidos

React + Firebase + Vite app, ready for GitHub and Vercel.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Vercel setup

1. Upload this folder to GitHub.
2. Import the GitHub repo in Vercel.
3. Add the environment variables from `.env.example` in Vercel > Project Settings > Environment Variables.
4. Build command: `npm run build`.
5. Output directory: `dist`.

## Firebase notes

Enable Anonymous sign-in in Firebase Authentication.
The app uses Firestore paths under:

`artifacts/produccion/public/data/...`

For production, tighten Firestore rules and avoid relying on PINs as the only access control.
