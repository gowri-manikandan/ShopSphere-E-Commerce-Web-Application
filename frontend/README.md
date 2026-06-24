# ShopSphere — E-Commerce Frontend

This is a clean, modern, responsive storefront frontend for the ShopSphere REST API, built using **pure HTML5, CSS3, and vanilla ES6+ JavaScript**. It consumes the backend REST endpoints via `fetch` and stores JWT user details in `localStorage`.

## Technologies Used
- **Structure**: Semantic HTML5
- **Styles**: Modern Vanilla CSS3 utilizing CSS custom properties (variables), transitions, animations, CSS Grid, and Flexbox layouts.
- **Logic**: Vanilla ES6+ JavaScript Modules
- **Icons**: SVG vectors embedded inline

## Project Structure
```
frontend/
├── index.html            (homepage / product catalog filter and search)
├── login.html            (clean login form card + redirects)
├── register.html         (customer signup form card + inputs validation)
├── product.html          (details view, quantity selectors, review listings + submissions)
├── cart.html             (shopping cart adjustments, clear, checkout links)
├── checkout.html         (addresses selector, addresses modal creator, payments radio selector)
├── orders.html           (user history list with collapsible receipt drawer)
├── admin.html            (admin dashboard switching between Products, Categories, and Orders)
├── css/
│   └── styles.css        (global stylesheet defining color systems and animation frames)
└── js/
    ├── config.js         (API base URL configuration)
    ├── api.js            (custom fetch wrapper supporting JWT headers and session expiration checks)
    ├── auth.js           (login/register logic, localStorage handling, route guards)
    ├── ui.js             (stacked toasts, confirm overlays, loaders, skeleton generators)
    ├── navbar.js         (responsive responsive headers, live cart count refreshes)
    ├── catalog.js        (homepage loading, category chips, debounced search catalog)
    ├── product.js        (product display details loader, review forms submissions)
    ├── cart.js           (shopping cart row calculations, item deletions, clear calls)
    ├── checkout.js       (address addition dialogs, order checkout submissions, order receipts)
    └── admin.js          (products CRUD, categories CRUD, order status update selectors)
```

## How to Run & Test

### 1. Run the Spring Boot Backend
Make sure your MySQL database is active, and launch the Spring Boot REST API. 
The database initializer automatically seeds sample categories, products, and a default admin user on first boot.
The server runs on:
`http://localhost:8080`

### 2. Launch the Static Frontend
Open the `frontend/` directory in VS Code and start the **Live Server** extension (or any equivalent local static web server) on port **5500**.
The frontend is configured to run at:
`http://localhost:5500`

> [!NOTE]
> The backend application includes CORS configurations permitting requests coming from `http://localhost:5500` and `http://127.0.0.1:5500`.

### 3. Test Credentials
To access all administration dashboard functions (creating products, categories, or updating client order shipment statuses):
- **Role**: `ADMIN`
- **Email**: `admin@shopsphere.com`
- **Password**: `admin123`

You can also register a standard customer account using the **Register** link to test standard checkout, address creation, payments, and product review submissions.
