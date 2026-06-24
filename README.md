# ShopSphere — E-Commerce Backend (Spring Boot)

A full REST API backend for an e-commerce platform: product catalog, shopping cart,
orders, mock payments, reviews, addresses — secured with JWT and role-based access.

## Tech Stack
- Java 17, Spring Boot 3.2.5
- Spring Web, Spring Data JPA (Hibernate), Spring Security + JWT (jjwt 0.12.5)
- MySQL, Maven, Lombok

## Project Structure
```
src/main/java/com/shopsphere
├── ShopSphereApplication.java
├── config/         DataInitializer (seeds admin + sample catalog)
├── controller/     REST endpoints
├── dto/            request/response objects (+ validation)
├── entity/         JPA entities + enums
├── exception/      custom exceptions + global handler
├── mapper/         entity <-> DTO converters
├── repository/     Spring Data JPA interfaces
├── security/       JWT service, filter, SecurityConfig, user details
└── service/        business logic
src/main/resources/application.properties
```

## Prerequisites
1. **Java 17+**
2. **MySQL running** on `localhost:3306`. The DB `shopsphere` is auto-created
   (`createDatabaseIfNotExist=true`). Just set your MySQL username/password in
   `src/main/resources/application.properties`:
   ```properties
   spring.datasource.username=root
   spring.datasource.password=YOUR_PASSWORD
   ```

## How to Run
### Option A — IntelliJ IDEA (recommended on your machine)
1. **File → Open** this folder. IntelliJ detects the Maven project and downloads
   dependencies automatically (it uses your machine's trust store, so the corporate
   SSL proxy works).
2. Make sure MySQL is running and the password in `application.properties` is correct.
3. Run `ShopSphereApplication`. App starts on **http://localhost:8080**.

### Option B — Command line
```bash
mvn spring-boot:run
```

### ⚠️ Corporate-network build note (PKIX / SSL error)
On the office network, Maven on the command line may fail to download dependencies with:
`PKIX path building failed ... unable to find valid certification path`.
This is your network's HTTPS proxy intercepting the connection — **not a code issue**.
Fixes:
- **Easiest:** build inside **IntelliJ** (it trusts the system/corporate certificate).
- **Or** import the corporate root CA into the JDK truststore:
  ```bash
  keytool -import -alias corp-proxy -file corp-root-ca.cer \
    -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit
  ```
  (get the `.cer` from your IT team / browser certificate export).

## Seeded Test Data (created on first run)
- **Admin** → email: `admin@shopsphere.com`  password: `admin123`
- 3 categories (Electronics, Fashion, Books) + 4 sample products.
- Register your own customer via `POST /api/auth/register`.

## Authentication
1. `POST /api/auth/login` → returns a JWT `token`.
2. Send it on protected requests:
   ```
   Authorization: Bearer <token>
   ```

## API Reference
| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/api/auth/register` | public | Register customer |
| POST | `/api/auth/login` | public | Login, get JWT |
| GET | `/api/products` | public | List products (`?categoryId=` / `?search=`) |
| GET | `/api/products/{id}` | public | Product details |
| POST | `/api/products` | ADMIN | Create product |
| PUT | `/api/products/{id}` | ADMIN | Update product |
| DELETE | `/api/products/{id}` | ADMIN | Delete product |
| GET | `/api/categories` | public | List categories |
| POST/PUT/DELETE | `/api/categories/**` | ADMIN | Manage categories |
| GET | `/api/cart` | auth | View cart |
| POST | `/api/cart/add` | auth | Add to cart |
| PUT | `/api/cart/update` | auth | Update quantity |
| DELETE | `/api/cart/remove/{productId}` | auth | Remove item |
| DELETE | `/api/cart/clear` | auth | Clear cart |
| GET | `/api/addresses` | auth | My addresses |
| POST | `/api/addresses` | auth | Add address |
| DELETE | `/api/addresses/{id}` | auth | Delete address |
| POST | `/api/orders/checkout` | auth | Place order from cart |
| GET | `/api/orders` | auth | My order history |
| GET | `/api/orders/{id}` | auth | My order details |
| GET | `/api/admin/orders` | ADMIN | All orders |
| PUT | `/api/admin/orders/{id}/status?status=SHIPPED` | ADMIN | Update order status |
| GET | `/api/reviews/product/{productId}` | public | Product reviews |
| POST | `/api/reviews` | auth | Add/update review |

## Example: place an order
```bash
# 1. login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@shopsphere.com","password":"admin123"}'

# 2. add an address (use the token from step 1)
curl -X POST http://localhost:8080/api/addresses \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"line1":"12 MG Road","city":"Chennai","pincode":"600001"}'

# 3. add product to cart
curl -X POST http://localhost:8080/api/cart/add \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"productId":1,"quantity":2}'

# 4. checkout
curl -X POST http://localhost:8080/api/orders/checkout \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"addressId":1,"paymentMethod":"CARD"}'
```
