
const API = "";

// HTML SAFETY
function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// EXPIRY STATUS
function getExpiryStatus(dateString) {
    if (!dateString) return "unknown";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(dateString + "T00:00:00");
    const days = Math.ceil((expiry - today) / 86400000);

    if (days < 0) return "expired";
    if (days <= 7) return "expiring";

    return "fresh";
}

// LOW STOCK
function isLowStock(item) {
    return Number(item[2]) <= Number(item[5]);
}

// CLEAR AUTH MESSAGES
function clearAuthMessages() {
    const loginMessage = document.getElementById("login-message");
    const signupMessage = document.getElementById("signup-message");

    if (loginMessage) {
        loginMessage.textContent = "";
        loginMessage.className = "form-message";
    }

    if (signupMessage) {
        signupMessage.textContent = "";
        signupMessage.className = "form-message";
    }
}

// PAGE NAVIGATION
async function showPage(pageName) {
    clearAuthMessages();

    const loggedIn = await checkAuth();

    // Protect pages from logged-out users
    const protectedPages = [
        "dashboard",
        "pantry",
        "add-item",
        "shopping-list",
        "recipes"
    ];

    if (protectedPages.includes(pageName) && !loggedIn) {
        pageName = "login";
    }

    // Hide all sections
    document.querySelectorAll(".page-section").forEach(page => {
        page.style.display = "none";
    });

    // Show selected section
    const page = document.getElementById(pageName);

    if (page) {
        page.style.display = "block";
    }

    window.scrollTo(0, 0);

    // Load page data
    if (loggedIn) {
        if (pageName === "dashboard") loadDashboard();
        if (pageName === "pantry") loadItems();
        if (pageName === "shopping-list") loadShoppingList();
        if (pageName === "recipes") loadRecipes();
    }
}

// AUTH STATUS
async function checkAuth() {
    let loggedIn = false;

    try {
        const response = await fetch("/auth/me");
        const data = await response.json();

        loggedIn = response.ok && data.logged_in === true;

    } catch (error) {
        console.error("Authentication check failed:", error);
    }

    // Login and logout buttons
    const loginLink = document.getElementById("login-link");
    const logoutLink = document.getElementById("logout-link");

    if (loginLink) {
        loginLink.style.display = loggedIn ? "none" : "inline";
    }

    if (logoutLink) {
        logoutLink.style.display = loggedIn ? "inline" : "none";
    }

    // Show/hide protected navbar links
    const protectedLinks = document.querySelectorAll(
        "#main-nav a[onclick*=\"dashboard\"]," +
        "#main-nav a[onclick*=\"pantry\"]," +
        "#main-nav a[onclick*=\"add-item\"]," +
        "#main-nav a[onclick*=\"shopping-list\"]," +
        "#main-nav a[onclick*=\"recipes\"]"
    );

    protectedLinks.forEach(link => {
        link.style.display = loggedIn ? "inline" : "none";
    });

    return loggedIn;
}

// SIGNUP
document.getElementById("signup-form").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const message = document.getElementById("signup-message");
        message.textContent = "Creating account...";

        const payload = {
            name: document.getElementById("signup-name").value.trim(),
            email: document.getElementById("signup-email").value.trim(),
            password: document.getElementById("signup-password").value
        };

        try {
            const response = await fetch("/auth/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || "Signup failed");
            }

            document.getElementById("signup-form").reset();

            clearAuthMessages();

            await checkAuth();
            await showPage("dashboard");

        } catch (error) {
            message.textContent = error.message;
        }
    }
);

// LOGIN
document.getElementById("login-form").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const message = document.getElementById("login-message");

        // Clear any old message before starting
        message.textContent = "";
        message.className = "form-message";

        message.textContent = "Logging in...";

        const payload = {
            email: document.getElementById("login-email").value.trim(),
            password: document.getElementById("login-password").value
        };

        try {
            const response = await fetch("/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || "Login failed");
            }

            // Clear success message instead of keeping it on screen
            message.textContent = "";
            message.className = "form-message";

            document.getElementById("login-form").reset();

            await checkAuth();
            await showPage("dashboard");

        } catch (error) {
            message.textContent = error.message;
        }
    }
);

// LOGOUT
async function logout() {
    try {
        const response = await fetch("/auth/logout", {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Could not log out.");
        }

        // Clear login form and messages
        document.getElementById("login-form").reset();

        clearAuthMessages();

        await checkAuth();
        await showPage("home");

    } catch (error) {
        alert(error.message || "Could not log out.");
    }
}

// LOAD PANTRY ITEMS
async function loadItems() {
    const list = document.getElementById("pantry-list");
    list.innerHTML = "<p>Loading pantry...</p>";

    try {
        const response = await fetch("/items");

        if (!response.ok) {
            throw new Error("Please log in to view your pantry.");
        }

        const items = await response.json();
        renderItems(items);

    } catch (error) {
        list.innerHTML = `<p>${escapeHTML(error.message)}</p>`;
    }
}

// SEARCH AND FILTER
function renderItems(items) {
    const list = document.getElementById("pantry-list");

    const search = document.getElementById("pantry-search")
        .value.trim().toLowerCase();

    const filter = document.getElementById("pantry-filter").value;

    const filtered = items.filter(item => {
        const nameMatches = String(item[1]).toLowerCase().includes(search);
        const low = isLowStock(item);
        const expiry = getExpiryStatus(item[4]);

        let filterMatches = true;

        if (filter === "low") filterMatches = low;
        if (filter === "expiring") filterMatches = expiry === "expiring";
        if (filter === "expired") filterMatches = expiry === "expired";

        return nameMatches && filterMatches;
    });

    list.innerHTML = "";

    if (filtered.length === 0) {
        list.innerHTML = "<p>No matching pantry items found.</p>";
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "pantry-card";

        const expiryStatus = getExpiryStatus(item[4]);

        let expiryHTML = "";

        if (expiryStatus === "expired") {
            expiryHTML = '<span class="status-badge expired">Expired</span>';
        } else if (expiryStatus === "expiring") {
            expiryHTML = '<span class="status-badge expiry-status">Expiring Soon</span>';
        }

        card.innerHTML = `
            <h3>${escapeHTML(item[1])}</h3>
            <p><strong>Quantity:</strong> ${escapeHTML(item[2])} ${escapeHTML(item[3])}</p>
            <p><strong>Expiry:</strong> ${escapeHTML(item[4])}</p>
            ${expiryHTML}
            ${isLowStock(item)
                ? '<span class="status-badge low-stock">Low Stock</span>'
                : ''}
            <div class="card-actions">
                <button class="edit-btn" onclick="editItem(${Number(item[0])})">Edit</button>
                <button class="delete-btn" onclick="deleteItem(${Number(item[0])})">Delete</button>
            </div>
        `;

        list.appendChild(card);
    });
}

document.getElementById("pantry-search").addEventListener(
    "input",
    loadItems
);

document.getElementById("pantry-filter").addEventListener(
    "change",
    loadItems
);

// ADD ITEM
document.getElementById("item-form").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const params = new URLSearchParams({
            name: document.getElementById("item-name").value.trim(),
            quantity: document.getElementById("item-quantity").value,
            unit: document.getElementById("item-unit").value,
            expiry_date: document.getElementById("item-expiry").value,
            minimum_quantity: document.getElementById("item-minimum").value
        });

        const button = document.getElementById("save-button");
        const message = document.getElementById("form-message");

        button.disabled = true;
        button.textContent = "Saving...";

        try {
            const response = await fetch("/items?" + params, {
                method: "POST"
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || "Could not save item");
            }

            message.textContent = "Item added successfully!";

            document.getElementById("item-form").reset();

            await loadItems();
            await loadShoppingList();

            await showPage("pantry");

        } catch (error) {
            message.textContent = error.message;
        } finally {
            button.disabled = false;
            button.textContent = "Save Item";
        }
    }
);

// DELETE ITEM
async function deleteItem(itemId) {
    if (!confirm("Delete this pantry item?")) return;

    try {
        const response = await fetch("/items/" + itemId, {
            method: "DELETE"
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.detail || "Delete failed");
        }

        await loadItems();
        await loadShoppingList();

    } catch (error) {
        alert(error.message);
    }
}

// EDIT ITEM
async function editItem(itemId) {
    const name = prompt("Enter item name:");
    if (name === null || !name.trim()) return;

    const quantity = prompt("Enter quantity:");
    if (quantity === null || quantity.trim() === "") return;

    const unit = prompt("Enter unit:");
    if (unit === null || !unit.trim()) return;

    const expiry = prompt("Enter expiry date (YYYY-MM-DD):");
    if (expiry === null || !expiry.trim()) return;

    const minimum = prompt("Enter minimum quantity:");
    if (minimum === null || minimum.trim() === "") return;

    const params = new URLSearchParams({
        name: name.trim(),
        quantity,
        unit,
        expiry_date: expiry,
        minimum_quantity: minimum
    });

    try {
        const response = await fetch(
            "/items/" + itemId + "?" + params,
            { method: "PUT" }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "Update failed");
        }

        await loadItems();
        await loadShoppingList();

    } catch (error) {
        alert(error.message);
    }
}

// DASHBOARD
async function loadDashboard() {
    try {
        const response = await fetch("/items");

        if (!response.ok) {
            throw new Error("Please log in to view the dashboard.");
        }

        const items = await response.json();

        document.getElementById("total-items").textContent = items.length;

        const lowStock = items.filter(isLowStock);

        document.getElementById("low-stock-count").textContent =
            lowStock.length;

        const expiring = items.filter(item =>
            getExpiryStatus(item[4]) === "expiring"
        );

        document.getElementById("expiry-count").textContent =
            expiring.length;

        const alerts = document.getElementById("dashboard-alerts");
        alerts.innerHTML = "";

        const alertItems = items.filter(item => {
            const status = getExpiryStatus(item[4]);
            return status === "expired" || status === "expiring";
        });

        if (alertItems.length === 0) {
            alerts.innerHTML = "<p>No expiry alerts. Your pantry looks good!</p>";
            return;
        }

        alertItems.forEach(item => {
            const card = document.createElement("div");
            card.className = "pantry-card";

            card.innerHTML = `
                <h3>${escapeHTML(item[1])}</h3>
                <p>Expiry: ${escapeHTML(item[4])}</p>
                <span class="status-badge ${
                    getExpiryStatus(item[4]) === "expired"
                        ? "expired" : "expiry-status"
                }">
                    ${getExpiryStatus(item[4]) === "expired"
                        ? "Expired" : "Expiring Soon"}
                </span>
            `;

            alerts.appendChild(card);
        });

    } catch (error) {
        console.error(error);
    }
}

// SHOPPING LIST
async function loadShoppingList() {
    const list = document.getElementById("shopping-items");
    list.innerHTML = "<p>Loading shopping list...</p>";

    try {
        const response = await fetch("/shopping-list");

        if (!response.ok) {
            throw new Error("Could not load shopping list");
        }

        const items = await response.json();
        list.innerHTML = "";

        if (items.length === 0) {
            list.innerHTML = "<p>Everything is stocked up!</p>";
            return;
        }

        items.forEach(item => {
            const card = document.createElement("div");
            card.className = "pantry-card";

            card.innerHTML = `
                <h3>${escapeHTML(item[0])}</h3>
                <p>Current quantity: ${escapeHTML(item[1])} ${escapeHTML(item[2])}</p>
                <span class="status-badge low-stock">Restock Needed</span>
            `;

            list.appendChild(card);
        });

    } catch (error) {
        list.innerHTML = `<p>${escapeHTML(error.message)}</p>`;
    }
}

// RECIPE SUGGESTIONS
async function loadRecipes() {
    const list = document.getElementById("recipe-list");
    list.innerHTML = "<p>Finding recipes...</p>";

    try {
        const response = await fetch("/recipes");

        if (!response.ok) {
            throw new Error("Could not load recipes");
        }

        const recipes = await response.json();
        list.innerHTML = "";

        if (recipes.length === 0) {
            list.innerHTML = `
                <div class="pantry-card">
                    <h3>No recipes found</h3>
                    <p>Add ingredients like eggs, bread, milk or potatoes.</p>
                </div>
            `;
            return;
        }

        recipes.forEach(recipe => {
            const card = document.createElement("div");
            card.className = "pantry-card";

            card.innerHTML = `
                <h3>${escapeHTML(recipe.name)}</h3>
                <p><strong>Ingredients:</strong>
                    ${recipe.ingredients.map(escapeHTML).join(", ")}
                </p>
                <p>${escapeHTML(recipe.instructions || "")}</p>
            `;

            list.appendChild(card);
        });

    } catch (error) {
        list.innerHTML = `<p>${escapeHTML(error.message)}</p>`;
    }
}

// INITIALIZE
document.addEventListener("DOMContentLoaded", async function() {
    clearAuthMessages();
    await checkAuth();

    // Always start on home
    document.querySelectorAll(".page-section").forEach(page => {
        page.style.display = "none";
    });

    document.getElementById("home").style.display = "block";
});
