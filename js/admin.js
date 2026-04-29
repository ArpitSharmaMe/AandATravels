// ========== SECURITY CHECK ==========
(function checkAuth() {
    if (!sessionStorage.getItem('adminLoggedIn')) {
        window.location.href = 'index.html';
    }
})();

// ========== GLOBAL ARRAYS ==========
let vehicles = [
    { type: "hatchback", name: "Hatchback", baseFare: 50, perKm: 12, perMin: 1.5, capacity: 4, luggage: 2, icon: "🚗" },
    { type: "sedan", name: "Sedan", baseFare: 70, perKm: 14, perMin: 1.8, capacity: 4, luggage: 3, icon: "🚙" },
    { type: "suv", name: "SUV", baseFare: 100, perKm: 18, perMin: 2.2, capacity: 7, luggage: 4, icon: "🚙" },
    { type: "luxury", name: "Luxury", baseFare: 200, perKm: 35, perMin: 4, capacity: 4, luggage: 3, icon: "🏎️" },
    { type: "tempo", name: "Tempo Traveller", baseFare: 150, perKm: 25, perMin: 3, capacity: 12, luggage: 8, icon: "🚌" }
];

let popularRoutes = [
    { id: 1, pickup: "Dehradun", destination: "Mussoorie", distance: 35, time: 60, toll: 50 },
    { id: 2, pickup: "Dehradun", destination: "Haridwar", distance: 55, time: 90, toll: 100 },
    { id: 3, pickup: "Delhi", destination: "Dehradun", distance: 250, time: 300, toll: 450 }
];

let bookings = [];
let enquiries = [];

let revenueChart, vehicleChart, statusChart, monthlyChart;

// ========== LOCALSTORAGE OPERATIONS ==========
function loadLocalData() {
    const storedVehicles = localStorage.getItem('admin_vehicles');
    if (storedVehicles) vehicles = JSON.parse(storedVehicles);
    const storedRoutes = localStorage.getItem('admin_routes');
    if (storedRoutes) popularRoutes = JSON.parse(storedRoutes);
}

function saveLocalData() {
    localStorage.setItem('admin_vehicles', JSON.stringify(vehicles));
    localStorage.setItem('admin_routes', JSON.stringify(popularRoutes));
}

// ========== FIRESTORE REAL-TIME SYNC ==========
function listenToBookings() {
    db.collection("bookings").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        bookings = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            bookings.push({
                id: data.bookingId || doc.id,
                customer: data.customerName || data.customer,
                phone: data.customerPhone || data.phone,
                pickup: data.pickup,
                destination: data.destination,
                vehicle: data.vehicle,
                fare: data.fare,
                date: data.date,
                status: data.status || "pending",
                otp: data.otp,
                verified: data.verified || false,
                createdAt: data.createdAt
            });
        });
        renderDashboard();
        renderBookings();
        updateAnalyticsCharts();
    });
}

function listenToEnquiries() {
    db.collection("enquiries").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        enquiries = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            enquiries.push({
                id: doc.id,
                name: data.name,
                email: data.email,
                phone: data.phone,
                subject: data.subject,
                message: data.message,
                date: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(),
                handled: data.handled || false
            });
        });
        renderEnquiries();
    });
}

// ========== RENDER FUNCTIONS ==========
function renderDashboard() {
    document.getElementById('totalBookings').innerText = bookings.length;
    const totalRevenue = bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => {
        let fare = parseFloat(b.fare?.replace(/[^0-9.-]/g, '')) || 0;
        return sum + fare;
    }, 0);
    document.getElementById('totalRevenue').innerText = `₹${totalRevenue.toLocaleString()}`;
    document.getElementById('activeVehicles').innerText = vehicles.length;
    document.getElementById('pendingBookings').innerText = bookings.filter(b => b.status === 'pending').length;

    const recentBody = document.querySelector('#recentBookingsTable tbody');
    if (recentBody) {
        recentBody.innerHTML = bookings.slice(0, 5).map(b => `
            <tr>
                <td>${b.id}</td>
                <td>${b.customer}</td>
                <td>${b.phone}</td>
                <td>${b.pickup} → ${b.destination}</td>
                <td>₹${b.fare}</td>
                <td><span class="status-badge status-${b.status}">${b.status}</span></td>
                <td>${b.otp || '—'}</td>
                <td><button class="btn-edit" onclick="viewBooking('${b.id}')">View</button></td>
            </tr>
        `).join('');
    }
}

function renderBookings() {
    const tbody = document.querySelector('#allBookingsTable tbody');
    if (tbody) {
        tbody.innerHTML = bookings.map(b => `
            <tr>
                <td>${b.id}</td>
                <td>${b.customer}</td>
                <td>${b.phone}</td>
                <td>${b.pickup}</td>
                <td>${b.destination}</td>
                <td>${b.vehicle}</td>
                <td>₹${b.fare}</td>
                <td>${b.date}</td>
                <td><span class="status-badge status-${b.status}">${b.status}</span></td>
                <td>${b.otp || '—'}</td>
                <td>
                    <button class="btn-edit" onclick="editBooking('${b.id}')">Edit</button>
                    <button class="btn-delete" onclick="deleteBooking('${b.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    }
}

function renderPricing() {
    const grid = document.getElementById('pricingGrid');
    grid.innerHTML = vehicles.map(v => `
        <div class="pricing-card">
            <h4>${v.icon} ${v.name}</h4>
            <div class="form-group"><label>Base Fare (₹)</label><input type="number" class="vehicle-base" data-type="${v.type}" value="${v.baseFare}"></div>
            <div class="form-group"><label>Per km (₹)</label><input type="number" class="vehicle-perkm" data-type="${v.type}" value="${v.perKm}" step="0.5"></div>
            <div class="form-group"><label>Per minute (₹)</label><input type="number" class="vehicle-permin" data-type="${v.type}" value="${v.perMin}" step="0.1"></div>
            <div class="form-group"><label>Capacity (seats)</label><input type="number" class="vehicle-capacity" data-type="${v.type}" value="${v.capacity}"></div>
        </div>
    `).join('');
}

function renderVehicles() {
    const tbody = document.querySelector('#vehiclesTable tbody');
    if (tbody) {
        tbody.innerHTML = vehicles.map(v => `
            <tr>
                <td>${v.icon}</td>
                <td>${v.name}</td>
                <td>₹${v.baseFare}</td>
                <td>₹${v.perKm}</td>
                <td>₹${v.perMin}</td>
                <td>${v.capacity}</td>
                <td>
                    <button class="btn-edit" onclick="editVehicle('${v.type}')">Edit</button>
                    <button class="btn-delete" onclick="deleteVehicle('${v.type}')">Delete</button>
                </td>
            </tr>
        `).join('');
    }
}

function renderRoutes() {
    const tbody = document.querySelector('#routesTable tbody');
    if (tbody) {
        tbody.innerHTML = popularRoutes.map(r => `
            <tr>
                <td>${r.pickup}</td>
                <td>${r.destination}</td>
                <td>${r.distance}</td>
                <td>${r.time}</td>
                <td>₹${r.toll}</td>
                <td>
                    <button class="btn-edit" onclick="editRoute(${r.id})">Edit</button>
                    <button class="btn-delete" onclick="deleteRoute(${r.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    }
}

function renderEnquiries() {
    const tbody = document.querySelector('#enquiriesTable tbody');
    if (!tbody) return;
    tbody.innerHTML = enquiries.map(e => `
        <tr>
            <td>${escapeHtml(e.name)}</td>
            <td>${escapeHtml(e.email)}</td>
            <td>${escapeHtml(e.phone)}</td>
            <td>${escapeHtml(e.subject)}</td>
            <td>${escapeHtml(e.message.substring(0, 100))}${e.message.length > 100 ? '...' : ''}</td>
            <td>${e.date.toLocaleDateString()}</td>
            <td><input type="checkbox" class="enquiry-handled" data-id="${e.id}" ${e.handled ? 'checked' : ''}></td>
            <td><button class="btn-delete" onclick="deleteEnquiry('${e.id}')">Delete</button></td>
        </tr>
    `).join('');

    // Attach change event to checkboxes
    document.querySelectorAll('.enquiry-handled').forEach(cb => {
        cb.removeEventListener('change', handleEnquiryCheckbox);
        cb.addEventListener('change', handleEnquiryCheckbox);
    });
}

function handleEnquiryCheckbox(e) {
    const id = e.target.dataset.id;
    const handled = e.target.checked;
    db.collection("enquiries").doc(id).update({ handled: handled });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function deleteEnquiry(id) {
    if (confirm('Delete this enquiry?')) {
        await db.collection("enquiries").doc(id).delete();
    }
}

// ========== ANALYTICS CHARTS ==========
function updateAnalyticsCharts() {
    // Revenue trend (last 7 days)
    const last7Days = [];
    const revenueData = [];
    for (let i = 6; i >= 0; i--) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        let dateStr = d.toISOString().split('T')[0];
        last7Days.push(dateStr.slice(5));
        let dailyRevenue = bookings.filter(b => b.date === dateStr && b.status === 'confirmed')
            .reduce((sum, b) => sum + (parseFloat(b.fare?.replace(/[^0-9.-]/g, '')) || 0), 0);
        revenueData.push(dailyRevenue);
    }
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(document.getElementById('revenueChart'), {
        type: 'line',
        data: { labels: last7Days, datasets: [{ label: 'Revenue (₹)', data: revenueData, borderColor: '#004d7a', fill: false }] }
    });

    // Bookings by vehicle type
    const vehicleCount = {};
    bookings.forEach(b => { vehicleCount[b.vehicle] = (vehicleCount[b.vehicle] || 0) + 1; });
    if (vehicleChart) vehicleChart.destroy();
    vehicleChart = new Chart(document.getElementById('vehicleChart'), {
        type: 'bar',
        data: { labels: Object.keys(vehicleCount), datasets: [{ label: 'Number of Bookings', data: Object.values(vehicleCount), backgroundColor: '#00bf72' }] }
    });

    // Booking status distribution
    const statusCount = { pending: 0, confirmed: 0, cancelled: 0 };
    bookings.forEach(b => { if (statusCount[b.status] !== undefined) statusCount[b.status]++; });
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('statusChart'), {
        type: 'pie',
        data: { labels: ['Pending', 'Confirmed', 'Cancelled'], datasets: [{ data: [statusCount.pending, statusCount.confirmed, statusCount.cancelled], backgroundColor: ['#ffc107', '#28a745', '#dc3545'] }] }
    });

    // Monthly bookings (last 6 months)
    const months = [];
    const monthlyCount = [];
    for (let i = 5; i >= 0; i--) {
        let d = new Date();
        d.setMonth(d.getMonth() - i);
        let monthStr = d.toLocaleString('default', { month: 'short' });
        months.push(monthStr);
        let count = bookings.filter(b => new Date(b.date).getMonth() === d.getMonth() && new Date(b.date).getFullYear() === d.getFullYear()).length;
        monthlyCount.push(count);
    }
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(document.getElementById('monthlyChart'), {
        type: 'line',
        data: { labels: months, datasets: [{ label: 'Bookings', data: monthlyCount, borderColor: '#004d7a', fill: false }] }
    });
}

// ========== PRICING SAVE ==========
function savePricing() {
    document.querySelectorAll('.vehicle-base').forEach(inp => {
        const type = inp.dataset.type;
        const vehicle = vehicles.find(v => v.type === type);
        if (vehicle) vehicle.baseFare = parseFloat(inp.value);
    });
    document.querySelectorAll('.vehicle-perkm').forEach(inp => {
        const type = inp.dataset.type;
        const vehicle = vehicles.find(v => v.type === type);
        if (vehicle) vehicle.perKm = parseFloat(inp.value);
    });
    document.querySelectorAll('.vehicle-permin').forEach(inp => {
        const type = inp.dataset.type;
        const vehicle = vehicles.find(v => v.type === type);
        if (vehicle) vehicle.perMin = parseFloat(inp.value);
    });
    document.querySelectorAll('.vehicle-capacity').forEach(inp => {
        const type = inp.dataset.type;
        const vehicle = vehicles.find(v => v.type === type);
        if (vehicle) vehicle.capacity = parseInt(inp.value);
    });
    const peak = document.getElementById('peakMultiplier').value;
    const night = document.getElementById('nightMultiplier').value;
    const conv = document.getElementById('convenienceFee').value;
    const gst = document.getElementById('gstPercent').value;
    localStorage.setItem('admin_peakMultiplier', peak);
    localStorage.setItem('admin_nightMultiplier', night);
    localStorage.setItem('admin_convenienceFee', conv);
    localStorage.setItem('admin_gstPercent', gst);
    saveLocalData();
    renderVehicles();
    alert('Pricing saved successfully!');
}

// ========== VEHICLE MANAGEMENT ==========
function addVehicle() {
    const newType = prompt('Enter vehicle type (unique id):', 'newcar');
    if (!newType) return;
    const newName = prompt('Enter vehicle name:', 'New Car');
    vehicles.push({ type: newType, name: newName, baseFare: 50, perKm: 12, perMin: 1.5, capacity: 4, luggage: 2, icon: "🚗" });
    saveLocalData();
    renderVehicles();
    renderPricing();
}

function deleteVehicle(type) {
    if (confirm('Delete this vehicle?')) {
        vehicles = vehicles.filter(v => v.type !== type);
        saveLocalData();
        renderVehicles();
        renderPricing();
    }
}

function editVehicle(type) {
    const vehicle = vehicles.find(v => v.type === type);
    if (!vehicle) return;
    const newName = prompt('Edit name:', vehicle.name);
    if (newName) vehicle.name = newName;
    saveLocalData();
    renderVehicles();
    renderPricing();
}

// ========== ROUTE MANAGEMENT ==========
function addRoute() {
    const pickup = prompt('Pickup city:');
    const destination = prompt('Destination city:');
    const distance = parseFloat(prompt('Distance (km):'));
    const time = parseFloat(prompt('Est. time (min):'));
    const toll = parseFloat(prompt('Est. toll (₹):'));
    const newId = popularRoutes.length ? Math.max(...popularRoutes.map(r => r.id)) + 1 : 1;
    popularRoutes.push({ id: newId, pickup, destination, distance, time, toll });
    saveLocalData();
    renderRoutes();
}

function deleteRoute(id) {
    if (confirm('Delete this route?')) {
        popularRoutes = popularRoutes.filter(r => r.id !== id);
        saveLocalData();
        renderRoutes();
    }
}

function editRoute(id) {
    const route = popularRoutes.find(r => r.id === id);
    if (!route) return;
    route.pickup = prompt('Pickup:', route.pickup) || route.pickup;
    route.destination = prompt('Destination:', route.destination) || route.destination;
    route.distance = parseFloat(prompt('Distance (km):', route.distance)) || route.distance;
    route.time = parseFloat(prompt('Time (min):', route.time)) || route.time;
    route.toll = parseFloat(prompt('Toll (₹):', route.toll)) || route.toll;
    saveLocalData();
    renderRoutes();
}

// ========== BOOKING MANAGEMENT (Firestore) ==========
async function updateBookingStatus(id) {
    const booking = bookings.find(b => b.id === id);
    if (!booking) return;
    const newStatus = prompt('Enter status (pending/confirmed/cancelled):', booking.status);
    if (newStatus && ['pending','confirmed','cancelled'].includes(newStatus)) {
        await db.collection("bookings").doc(id).update({ status: newStatus });
        alert('Status updated');
    }
}

function viewBooking(id) {
    const booking = bookings.find(b => b.id === id);
    alert(`Booking Details:\nID: ${booking.id}\nCustomer: ${booking.customer}\nPhone: ${booking.phone}\nRoute: ${booking.pickup} → ${booking.destination}\nFare: ₹${booking.fare}\nStatus: ${booking.status}\nOTP: ${booking.otp || 'N/A'}`);
}

async function deleteBooking(id) {
    if (confirm('Delete this booking permanently?')) {
        await db.collection("bookings").doc(id).delete();
        alert('Booking deleted');
    }
}

async function editBooking(id) {
    const booking = bookings.find(b => b.id === id);
    if (!booking) return;
    document.getElementById('editBookingId').value = id;
    document.getElementById('editCustomerName').value = booking.customer;
    document.getElementById('editPhone').value = booking.phone;
    document.getElementById('editPickup').value = booking.pickup;
    document.getElementById('editDestination').value = booking.destination;
    document.getElementById('editVehicle').value = booking.vehicle;
    document.getElementById('editFare').value = booking.fare.replace(/[^0-9.-]/g, '');
    document.getElementById('editDate').value = booking.date;
    document.getElementById('editStatus').value = booking.status;
    document.getElementById('editBookingModal').style.display = 'flex';
}

async function updateBooking() {
    const id = document.getElementById('editBookingId').value;
    const updatedData = {
        customerName: document.getElementById('editCustomerName').value,
        customerPhone: document.getElementById('editPhone').value,
        pickup: document.getElementById('editPickup').value,
        destination: document.getElementById('editDestination').value,
        vehicle: document.getElementById('editVehicle').value,
        fare: document.getElementById('editFare').value,
        date: document.getElementById('editDate').value,
        status: document.getElementById('editStatus').value
    };
    await db.collection("bookings").doc(id).update(updatedData);
    closeEditBookingModal();
    alert('Booking updated');
}

function closeEditBookingModal() {
    document.getElementById('editBookingModal').style.display = 'none';
}

function generateBookingId() {
    return 'AA' + Date.now().toString().slice(-8);
}

function openAddBookingModal() {
    document.getElementById('addBookingModal').style.display = 'flex';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('newDate').value = today;
    document.getElementById('newCustomerName').value = '';
    document.getElementById('newCustomerPhone').value = '';
    document.getElementById('newPickup').value = '';
    document.getElementById('newDestination').value = '';
    document.getElementById('newFare').value = '';
}

function closeAddBookingModal() {
    document.getElementById('addBookingModal').style.display = 'none';
}

async function saveNewBooking() {
    const customer = document.getElementById('newCustomerName').value.trim();
    const phone = document.getElementById('newCustomerPhone').value.trim();
    const pickup = document.getElementById('newPickup').value.trim();
    const destination = document.getElementById('newDestination').value.trim();
    const vehicleSelect = document.getElementById('newVehicle').value;
    const fare = parseFloat(document.getElementById('newFare').value);
    const date = document.getElementById('newDate').value;
    const status = document.getElementById('newStatus').value;
    const requests = document.getElementById('newRequests').value;

    if (!customer || !phone || !pickup || !destination || isNaN(fare) || !date) {
        alert('Please fill all required fields');
        return;
    }
    const vehicleName = vehicles.find(v => v.type === vehicleSelect)?.name || vehicleSelect;
    const newId = generateBookingId();
    const newBooking = {
        bookingId: newId,
        customerName: customer,
        customerPhone: phone,
        pickup: pickup,
        destination: destination,
        vehicle: vehicleName,
        fare: `₹${fare}`,
        date: date,
        status: status,
        specialRequests: requests,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        verified: false
    };
    await db.collection("bookings").doc(newId).set(newBooking);
    closeAddBookingModal();
    alert(`Booking created with ID: ${newId}`);
}

// ========== SETTINGS ==========
function loadSettings() {
    document.getElementById('companyName').value = localStorage.getItem('admin_companyName') || 'A and A Travels';
    document.getElementById('supportPhone').value = localStorage.getItem('admin_supportPhone') || '+91 9756354502';
    document.getElementById('supportEmail').value = localStorage.getItem('admin_supportEmail') || 'algomaster18@gmail.com';
    document.getElementById('advancePercent').value = localStorage.getItem('admin_advancePercent') || '20';
    document.getElementById('cancellationPolicy').value = localStorage.getItem('admin_cancellationPolicy') || 'Free cancellation up to 1 hour before pickup. 50% charges within 1 hour. No-show: 100% charges.';
}

function saveSettings() {
    localStorage.setItem('admin_companyName', document.getElementById('companyName').value);
    localStorage.setItem('admin_supportPhone', document.getElementById('supportPhone').value);
    localStorage.setItem('admin_supportEmail', document.getElementById('supportEmail').value);
    localStorage.setItem('admin_advancePercent', document.getElementById('advancePercent').value);
    localStorage.setItem('admin_cancellationPolicy', document.getElementById('cancellationPolicy').value);
    alert('Settings saved!');
}

function loadAdditionalPricing() {
    document.getElementById('peakMultiplier').value = localStorage.getItem('admin_peakMultiplier') || '1.25';
    document.getElementById('nightMultiplier').value = localStorage.getItem('admin_nightMultiplier') || '1.3';
    document.getElementById('convenienceFee').value = localStorage.getItem('admin_convenienceFee') || '30';
    document.getElementById('gstPercent').value = localStorage.getItem('admin_gstPercent') || '5';
}

// ========== NAVIGATION & LOGOUT ==========
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
            document.getElementById(`${section}-section`).classList.add('active');
            document.getElementById('pageTitle').innerText = item.querySelector('span').innerText;
            if (section === 'pricing') renderPricing();
            if (section === 'vehicles') renderVehicles();
            if (section === 'routes') renderRoutes();
            if (section === 'bookings') renderBookings();
            if (section === 'enquiries') renderEnquiries();
            if (section === 'analytics') updateAnalyticsCharts();
        });
    });
}

function logout() {
    sessionStorage.removeItem('adminLoggedIn');
    window.location.href = 'index.html';
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
    loadLocalData();
    renderPricing();
    renderVehicles();
    renderRoutes();
    loadSettings();
    loadAdditionalPricing();
    setupNavigation();
    await listenToBookings();
    listenToEnquiries();
});