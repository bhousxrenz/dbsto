# Barangay 201 API (added to db-api)

All routes live under `/api/v1/barangay` and need `Authorization: Bearer <accessToken>`
(except image downloads). Responses look like `{ success, message, data }`.

## Environment variables (Render → Environment)

| Name | Required | What it is |
| --- | --- | --- |
| `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SECRETKEY`, `PORT` | yes | already in use |
| `ADMIN_USER_IDS` | no | comma list of admin ids, default `admin` |
| `ADMIN_SETUP_KEY` | yes (once) | secret that lets you create the admin account |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | for password recovery | Gmail address + Google App Password |

## Create the admin account (once)

```bash
curl -X POST https://db-api-hx9o.onrender.com/api/v1/auths/signup \
  -H "Content-Type: application/json" \
  -d '{"id":"admin","password":"CHOOSE-A-STRONG-PASSWORD","adminKey":"<ADMIN_SETUP_KEY>","data":{"fullName":"Barangay 201 Admin"}}'
```

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/sync` | any | everything the user may see: announcements (+comments), wanted/missing, document requests, chat messages, notifications (admin also gets `citizens`) |
| GET | `/images/announcements/:id`, `/images/persons/:id`, `/images/users/:userId` | public | photo bytes (`users` = profile photo of an admin or citizen) |
| PUT / DELETE | `/profile-photo` | any | set `{photo}` (base64 JPEG/PNG, max 2MB) / remove my own profile photo |
| POST / PATCH / DELETE | `/announcements`, `/announcements/:id` | admin | body `{content, image?, removeImage?}` (`image` = base64 JPEG) |
| POST | `/announcements/:id/comments` | any | `{text}` |
| POST | `/announcements/:id/comments/:commentId/replies` | any | `{text}` |
| PUT | `/announcements/:id/comments/:commentId/reaction` | any | `{emoji, replyId?}` (`emoji: null` clears, `"DISLIKE"` = thumbs-down) |
| POST / PATCH / DELETE | `/persons`, `/persons/:id` | admin | `{type, name, age, gender, address, description, contactNumber, photo?, isFound?}` |
| POST | `/documents` | citizen | `{type, fullName, address, contactNumber, birthDate, civilStatus, purpose, emergencyContactName, emergencyContactNumber}` |
| PATCH / DELETE | `/documents/:id/status`, `/documents/:id` | admin | `{status: PENDING|READY|CLAIMED}` |
| POST | `/messages` | any | citizen `{text}`; admin `{text, threadKey}` (citizen's userId) |
| POST | `/notifications/read` | any | marks my notifications read |
| GET | `/users/:userId/id-photo` | admin | `{ userId, contentType, base64 }` — the citizen's uploaded valid ID |
| PATCH | `/users/:userId/verify` | admin | `{status: PENDING|VERIFIED|REJECTED}` — confirms the citizen is a barangay resident |

Notifications are created by the server in the same request that causes them
(admin posts → `ALL` citizens, citizen comments/requests/messages → `ADMIN`, admin replies/status → that citizen).

## Other changes

* `auths/signup` accepts `userdata`/`userlink` (what the app sends) as well as `data`/`link`. Before this, user data was silently dropped.
* Citizen sign-up now requires `idPhoto` (base64 JPEG, max 2MB) — a valid ID the admin reviews before marking the account `VERIFIED`. Admin accounts are exempt and created as `VERIFIED` automatically.
* The ids in `ADMIN_USER_IDS` can only be created with `adminKey`.
* `auths/recover` now needs an emailed code (`POST /auths/recover/request`, then `POST /auths/recover`). It used to reset anyone's password with just their id.
* `users`: list = admin only; read/patch/delete = yourself or admin; citizens can only change `userData`/`userLink`.
* Rate limit raised to 1500 requests / 15 min (the app polls); `auths/*` limited to 40 / 15 min; `trust proxy` enabled for Render; JSON body limit 4 MB.

* Profile photos: `/sync` now returns `admin` / `admins` (`userId, fullName, hasProfilePhoto, photoUpdatedAt`) for everyone, `hasProfilePhoto` + `photoUpdatedAt` on each item of `citizens` (admin), and `myHasProfilePhoto` / `myPhotoUpdatedAt`. Load with `GET /images/users/:userId?v=<photoUpdatedAt>`.
