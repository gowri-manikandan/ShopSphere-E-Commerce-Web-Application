# CLAUDE.md — E-Commerce Web App (Mid-Level, AI-Powered Search)

This file is the single source of truth for architecture, conventions, and scope.
Read this fully before implementing any module. Follow it exactly unless the user
explicitly says otherwise in a prompt.

---

## 1. Project Summary

A mid-level, portfolio-grade e-commerce web application with:
- Standard commerce flow (auth → browse → cart → checkout → order → payment)
- **Signature differentiator:** AI-powered product recommendations & semantic search
- **Moderate real-time:** live stock updates + live order status tracking

Goal: not a tutorial clone. The AI search + real-time stock/order layer is what
makes this project stand out — treat those two as first-class, not bolted-on.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Language | Java 17+ |
| Framework | Spring Boot 3.x |
| ORM | Hibernate (via Spring Data JPA) |
| Database | MySQL 8 |
| Security | Spring Security + JWT (stateless) |
| Build | Maven |
| Real-time | Spring WebSocket + STOMP (SockJS fallback) |
| AI / Search | OpenAI Embeddings API (or local model via Ollama) + cosine similarity service |
| Frontend | React (Vite) + Axios + STOMP.js client — *assumption, confirm if different* |
| Payments | Stripe (test mode) |
| Docs | springdoc-openapi (Swagger UI) |

Do not introduce a different DB, ORM, or security mechanism without being told to.

---

## 3. Module Scope

### Core (build first, in this order)
1. Project scaffolding + DB schema + Swagger setup
2. Auth (register/login, JWT issue + refresh, roles: `ROLE_USER`, `ROLE_ADMIN`, `ROLE_SELLER` optional)
3. User Module (profile, addresses)
4. Category Module
5. Product Module (CRUD, images via Cloudinary/UploadThing, pagination)
6. Search & Filter (keyword + filters: price, category, rating)
7. **AI Recommendations & Semantic Search** (differentiator — see §6)
8. Shopping Cart
9. Checkout
10. Orders (+ real-time status, see §5)
11. Payment (Stripe integration + webhook)
12. Admin Dashboard (basic CRUD views + order management)

### Stretch (only after core is stable)
13. Wishlist
14. Reviews & Ratings
15. Coupons
16. Notifications (in-app, tied to WebSocket)
17. Inventory Management (+ real-time stock, see §5)
18. Reports & Analytics
19. Security hardening pass
20. UI/UX + Performance pass

**Do not start a later module until the previous core module compiles, has a
passing test, and is committed.**

---

## 4. Architecture & Folder Conventions

Standard layered Spring Boot structure, one package per domain:

```
com.ecommerce.app
 ├── config/          # SecurityConfig, WebSocketConfig, OpenApiConfig, CorsConfig
 ├── common/
 │    ├── exception/  # Custom exceptions + GlobalExceptionHandler (@ControllerAdvice)
 │    ├── response/   # ApiResponse<T> wrapper (see §8)
 │    └── util/
 ├── auth/             # controller, service, dto
 ├── user/
 ├── product/
 ├── category/
 ├── cart/
 ├── order/
 ├── payment/
 ├── search/           # AI recommendation + semantic search service
 ├── realtime/         # WebSocket handlers, STOMP controllers
 └── admin/
```

Within each domain package: `controller/`, `service/` (+ `impl/`), `repository/`,
`entity/`, `dto/` (request/response separated), `mapper/` (MapStruct preferred
over manual mapping).

**Naming conventions:**
- DB tables: `snake_case`, plural (`products`, `order_items`)
- Java fields/methods: `camelCase`
- REST routes: `/api/v1/{resource}` plural, kebab-case for multi-word (`/api/v1/order-items`)
- DTOs: `ProductRequest`, `ProductResponse` — never expose entities directly in controllers

---

## 5. Real-Time Architecture (Moderate Scope)

Use **Spring WebSocket + STOMP**, no Redis (single-instance, not scaling yet).

**Scope — only these two, do not add more without instruction:**

1. **Live stock updates**
   - Topic: `/topic/stock/{productId}`
   - Triggered on: order placed, admin stock adjustment, cart hold expiry
   - Payload: `{ productId, availableStock, status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" }`
   - Frontend subscribes when viewing a product/listing page

2. **Live order status**
   - Topic: `/topic/orders/{userId}` (user-specific, authenticated subscription)
   - Statuses: `PLACED → CONFIRMED → PACKED → SHIPPED → DELIVERED` (+ `CANCELLED`)
   - Triggered on: admin/order-service status change
   - Payload: `{ orderId, status, updatedAt }`

**Concurrency rule:** stock decrement on order placement MUST use either
`@Version` optimistic locking on the `Product` entity or a pessimistic DB lock
inside the transaction — never a plain read-then-write. This is a common bug
source; do not skip it.

---

## 6. AI Recommendations & Semantic Search (Differentiator Module)

This is the flagship feature — implement carefully, not as an afterthought.

**Approach:**
1. On product create/update, generate a text embedding from
   `name + description + category + tags` using OpenAI's embedding endpoint
   (`text-embedding-3-small`) or a local model via Ollama if avoiding API cost.
2. Store the embedding as a `JSON`/`TEXT` column (serialized float array) on
   the `product_embeddings` table (separate table, not on `products`, to keep
   product reads fast).
3. **Semantic search endpoint** (`GET /api/v1/search/semantic?q=...`):
   embed the query, compute cosine similarity in-app (Java) against cached
   embeddings loaded into memory (fine at mid-level scale, <50k products).
   If scale grows: migrate to a vector DB (Weaviate, Milvus, or Postgres+pgvector —
   flag this as a future migration, don't build it now with MySQL).
4. **Recommendations endpoint** (`GET /api/v1/products/{id}/recommendations`):
   top-N nearest neighbors by embedding similarity, excluding out-of-stock items.
5. **"Ask AI" natural-language product finder** (stretch within this module):
   accept a free-text query like "gift for someone who likes running", embed it,
   return semantically closest products — this is the standout demo feature.

**Do not** call the AI API synchronously inside the product create/update request
if it's avoidable — queue embedding generation (simple `@Async` method is enough
at this scale; no need for a message broker).

---

## 7. Security

- Stateless JWT (access token ~15min, refresh token ~7d, refresh stored as
  httpOnly cookie)
- `BCrypt` password hashing
- `@PreAuthorize` on all admin endpoints, never role checks in controller logic
- Input validation via `@Valid` + Bean Validation annotations on all request DTOs
- Rate-limit auth endpoints (simple in-memory bucket at this scale, e.g. Bucket4j)
- CORS explicitly configured for the frontend origin only — no wildcard in production config

---

## 8. API Response Convention

All endpoints return a consistent wrapper:

```java
public class ApiResponse<T> {
    boolean success;
    String message;
    T data;
    Instant timestamp;
}
```

Errors handled centrally via `@ControllerAdvice` → same wrapper with
`success: false` and a `errorCode` field (e.g. `PRODUCT_NOT_FOUND`,
`INSUFFICIENT_STOCK`, `PAYMENT_FAILED`). Never let raw stack traces or
Hibernate exceptions leak to the client.

---

## 9. Payment

- Stripe test mode, `PaymentIntent` flow
- Webhook endpoint (`/api/v1/payments/webhook`) must verify Stripe signature
- **Idempotency:** store Stripe event IDs processed; reject duplicates —
  webhooks can be retried and must not double-fulfill orders

---

## 10. Testing

- JUnit 5 + Mockito for service-layer unit tests
- Testcontainers (MySQL) for repository/integration tests
- Minimum: Cart, Checkout, Order, Payment, and Stock-decrement logic must have
  tests — these are where real-time + concurrency bugs hide

---

## 11. Environment Config

Use `application.yml` with Spring profiles: `local`, `dev`, `prod`.
Secrets (DB creds, JWT secret, Stripe keys, OpenAI key) via environment
variables — never hardcoded, never committed.

---

## 12. Git Convention

- Branch per module: `feature/module-name`
- Commit after each module compiles + tests pass
- Conventional commits style: `feat(cart): add add-to-cart endpoint`

---

## 13. Frontend Conventions (React)

**Stack:** React + Vite, React Router, Axios, STOMP.js (`@stomp/stompjs` +
`sockjs-client`) for WebSocket, Tailwind CSS for styling.

**State management:** Context API only — no Redux/Zustand at this scale.
Two contexts are enough:
- `AuthContext` — user, token, role, login/logout
- `CartContext` — cart items, count, add/remove/update

Do not create a context per feature; local `useState` is fine for
component-local state (form inputs, modals, filters).

**Folder structure:**
```
src/
 ├── api/            # axios instance + one file per domain (productApi.js, cartApi.js...)
 ├── context/        # AuthContext.jsx, CartContext.jsx
 ├── hooks/          # useSocket.js, useAuth.js, useDebounce.js
 ├── components/     # shared/dumb components (Button, Card, Modal, Navbar)
 ├── pages/          # route-level components (ProductListPage, CheckoutPage...)
 ├── realtime/       # socket connection setup + subscription helpers
 └── utils/
```

**WebSocket pattern:** one shared STOMP client created in `realtime/socket.js`,
connected once after login (JWT passed as STOMP header, not query param).
Components subscribe/unsubscribe to specific topics inside `useEffect` with
cleanup on unmount — never let subscriptions leak across page navigation.

**API calls:** all requests go through a single Axios instance
(`api/axiosInstance.js`) with a response interceptor that unwraps the backend's
`ApiResponse<T>` wrapper (§8) and a request interceptor that attaches the JWT.
Components never call `axios` directly — always through `api/*.js` functions.

**Component conventions:**
- Function components + hooks only, no class components
- One component per file, PascalCase filenames matching component name
- Keep pages thin — data fetching in hooks (`useProducts`, `useOrders`), not inline in JSX
- Loading/error/empty states handled explicitly in every data-fetching component — no silent blank screens

**Do not** introduce Redux, MobX, GraphQL, or a separate SSR framework
(Next.js) — plain Vite SPA is the right scope here.

---

## 14. Deployment (Free Tier — Render + Aiven)

**Platform choice and why:** Railway's free tier was discontinued (now a one-time
trial credit only, then usage-based billing) — not compatible with a free-tier
constraint. Render still has a genuine free tier for both static sites and
Docker web services. Render does **not** offer free MySQL, so the database is
hosted separately on **Aiven** (free-forever MySQL, 1GB RAM/storage, no credit
card required).

**Topology:**
| Component | Platform | Notes |
|---|---|---|
| React frontend | Render Static Site | Free, no sleep, unlimited (within bandwidth quota) |
| Spring Boot backend | Render Web Service (Docker) | Free instance: 750 hrs/month, sleeps after 15 min idle |
| MySQL | Aiven Free Tier | External managed DB, connect over SSL |
| Product images | Cloudinary (free tier) | Required — Render's free filesystem is ephemeral |

### Backend (Render Web Service)
- Deployed via `Dockerfile` at repo root (multi-stage build: Maven build stage → slim JRE runtime stage)
- **Must** read the port from the `PORT` environment variable Render injects — do
  not hardcode `server.port` in `application.yml`; set
  `server.port=${PORT:8080}`
- Expose a health check at `/actuator/health` (Spring Boot Actuator) — Render
  uses this to confirm the service is up
- All secrets (DB URL, JWT secret, Stripe keys, OpenAI key, Cloudinary keys) go
  in Render's dashboard environment variables — never in `application.yml`
  directly, only as `${ENV_VAR}` placeholders
- CORS config must whitelist the exact Render static site URL in prod profile
  (no wildcard `*`)

### Frontend (Render Static Site)
- Build command: `npm run build`, publish directory: `dist`
- API base URL and WebSocket URL injected via Vite env vars
  (`VITE_API_URL`, `VITE_WS_URL`) set per-environment, never hardcoded

### Database (Aiven MySQL)
- Connection requires SSL (`useSSL=true` in the JDBC URL) — Aiven rejects
  non-SSL connections by default
- Use Hibernate `ddl-auto=validate` in prod (schema managed via Flyway
  migrations, not auto-generated) — never `update` or `create` against a
  real hosted DB

### Handling the free-tier sleep/cold-start reality
This directly affects the real-time module (§5) — do not skip this:
- **STOMP client must auto-reconnect** with exponential backoff
  (`@stomp/stompjs` has this built in via `reconnectDelay`) — a sleeping
  backend will drop the socket, and the frontend must silently reconnect
  when it wakes, not show a broken UI
- Show a lightweight "waking up the server..." loading state on first load
  if the initial health check / first API call takes >3s — this is normal
  cold-start behavior, not a bug
- Do not build any feature that assumes the backend is always warm (e.g.
  scheduled jobs relying on the instance being awake) — free instances can
  be asleep indefinitely between visits

### CI/CD
- Render auto-deploys on push to `main` for both services (native Git integration, no separate CI config needed at this scale)
- Add a GitHub Actions workflow only for running tests on PRs before merge — deployment itself stays Render's job

---

## 15. What NOT to do

- Don't add Redis, Kafka, or microservices split — out of scope for mid-level, adds ops burden with no demo payoff
- Don't expose JPA entities directly as API responses
- Don't implement real-time cart sync or real-time search — not in scope (§5)
- Don't skip optimistic/pessimistic locking on stock decrement
- Don't call external AI API inside a request thread that also holds a DB transaction open
- Don't store uploaded images or files on the backend's local filesystem — it's ephemeral on Render's free tier and will be wiped
- Don't hardcode `server.port` — Render assigns it dynamically via `PORT`
- Don't use `ddl-auto=update`/`create` against the Aiven database — use Flyway migrations
- Don't build a "ping the server every N minutes to prevent sleep" workaround — it burns your 750 free hours faster and violates the intent of the free tier; design the UI to tolerate cold starts instead
