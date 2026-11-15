# Deploy Team Lychee

This project has three services. Deploy the map API and the separate STRAUSS sound API to Cloud Run, then deploy `frontend/` to Firebase App Hosting. GoDaddy can remain the domain registrar and DNS provider. No Vercel account is required.

## Before deploying

1. Commit and push both repositories. App Hosting builds the frontend from GitHub, so local changes are not included until pushed.
2. Create a Google Cloud project, enable billing, install and sign in to the Google Cloud CLI, and choose a supported region near your visitors. The examples use `europe-west1`.
3. In the Google Cloud console, enable Cloud Run, Cloud Build, Artifact Registry, and Cloud Storage APIs.
4. Create a Cloud Storage bucket for uploaded maps in the same region. Keep the bucket private. Grant the map API's Cloud Run service account **Storage Object Admin** on this bucket. Set `MAP_UPLOAD_BUCKET` to the bucket name, without `gs://`. Without it, uploads use local disk and will disappear when a Cloud Run instance stops.

## Cloud Run APIs

From the frontend/map repository root, deploy the map API:

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud run deploy lychee-map-api \
  --source backend \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --max-instances 3 \
  --set-env-vars MAP_UPLOAD_BUCKET=YOUR_BUCKET_NAME
```

From the separate sound repository root, deploy the STRAUSS API:

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud run deploy lychee-sound-api \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 1 \
  --max-instances 3 \
  --timeout 300
```

Cloud Run prints each service URL. Save both. Check `https://MAP_URL/docs`, `https://SOUND_URL/health`, and `https://SOUND_URL/templates`. The sound service serves `POST /sonify`; the map service serves `POST /api/raster-selection` and `POST /api/maps`.

## Firebase App Hosting frontend

Create a Firebase project linked to the same Google Cloud project. In **Firebase Console → App Hosting → Create backend**, connect the frontend/map GitHub repository, set the app root to `frontend`, and select the branch to deploy. The checked-in `frontend/apphosting.yaml` limits the frontend to three instances.

In App Hosting backend settings, add these environment variables **before the first rollout**:

| Variable | Value |
| --- | --- |
| `MAP_API_INTERNAL_URL` | Full Cloud Run map URL, without a trailing slash |
| `SONIFY_API_INTERNAL_URL` | Full Cloud Run sound URL, without a trailing slash |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional browser key for the detailed Google map |
| `NEXT_PUBLIC_DEMO_YOUTUBE_URL` | Optional YouTube video URL or ID |

The first two variables must be available at **build and runtime** because Next.js builds the `/map-api` and `/sound-api` rewrites. Leave `NEXT_PUBLIC_MAP_API_URL` and `NEXT_PUBLIC_SONIFY_API_URL` unset to keep browser requests on the frontend's own origin. Restrict the Maps browser key to your deployed domain in Google Cloud Console.

## GoDaddy domain

In **Firebase App Hosting → Custom domains**, add the domain you own. Enter exactly the TXT, A, or CNAME records shown by Firebase in **GoDaddy → Domain Portfolio → DNS**. Remove conflicting records for the same host. Firebase handles HTTPS after verification. You do not need GoDaddy website hosting for this setup.

## Final checks

Open the deployed site on another device. Test `/map-api/docs`, `/sound-api/health`, the template chooser, one uploaded map, and an actual Normal, 3D, and 8D sound render. Uploaded maps should still load after the map Cloud Run service is redeployed. Set a billing budget and review Cloud Run usage after the first test.

Official guides: [Cloud Run source deploy](https://docs.cloud.google.com/run/docs/deploying-source-code), [App Hosting setup](https://firebase.google.com/docs/app-hosting/get-started), [App Hosting configuration](https://firebase.google.com/docs/app-hosting/configure), [custom domain](https://firebase.google.com/docs/app-hosting/custom-domain).
