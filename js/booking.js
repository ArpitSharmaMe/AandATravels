// ========== FIREBASE & EMAILJS CONFIGURATION ==========
// Make sure firebase and emailjs scripts are loaded before this file.

// ========== FARE CONFIGURATION ==========
const fareConfig = {
    hatchback: {
        name: "Hatchback", icon: "fas fa-car", capacity: 4, luggage: 2,
        baseFare: 100, perKm: 12, minimumDistance: 50,
        waitingCharge: 100, nightCharge: 1.25,
        description: "Compact car for 4 passengers"
    },
    sedan: {
        name: "Sedan", icon: "fas fa-car-side", capacity: 4, luggage: 3,
        baseFare: 150, perKm: 14, minimumDistance: 50,
        waitingCharge: 120, nightCharge: 1.30,
        description: "Comfortable sedan for 4 passengers"
    },
    suv: {
        name: "SUV", icon: "fas fa-truck", capacity: 7, luggage: 4,
        baseFare: 200, perKm: 18, minimumDistance: 50,
        waitingCharge: 150, nightCharge: 1.35,
        description: "Spacious SUV for 7 passengers"
    },
    luxury: {
        name: "Luxury", icon: "fas fa-gem", capacity: 4, luggage: 3,
        baseFare: 300, perKm: 35, minimumDistance: 50,
        waitingCharge: 200, nightCharge: 1.50,
        description: "Premium luxury car for 4 passengers"
    },
    tempo: {
        name: "Tempo Traveller", icon: "fas fa-bus", capacity: 12, luggage: 8,
        baseFare: 400, perKm: 25, minimumDistance: 50,
        waitingCharge: 180, nightCharge: 1.40,
        description: "Large vehicle for 12 passengers"
    }
};

const TOLL_RATE_PER_KM = 2.0;
const DRIVER_ALLOWANCE_PER_DAY = 500;
const GST_RATE = 0.05;
const nightHours = { start: 22, end: 6 };

// ========== GLOBAL VARIABLES ==========
let map;
let pickupMarker = null;
let destinationMarker = null;
let routeControl = null;
let currentDistance = 0;
let selectedVehicle = null;
let selectedPayment = 'cash';
let currentStep = 1;
let currentOtp = null;

// ========== MAP INITIALIZATION ==========
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    map = L.map('map').setView([30.3165, 78.0322], 13);
    const primaryLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);

    const fallbackLayer = L.tileLayer('https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OSM Team',
        maxZoom: 18
    });

    primaryLayer.on('tileerror', function() {
        map.removeLayer(primaryLayer);
        fallbackLayer.addTo(map);
        console.warn('Switched to fallback map tiles');
    });

    setTimeout(() => map.invalidateSize(), 100);

    initializeAutocomplete();
    setDefaultDateTime();
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('tripType').addEventListener('change', () => { updateTripType(); updatePrice(); updateSummary(); });
    document.getElementById('tripDays').addEventListener('change', () => { updatePrice(); updateSummary(); });
    document.getElementById('passengers').addEventListener('change', () => { updatePassengerLimit(); updatePrice(); updateSummary(); });
    document.getElementById('travelDate').addEventListener('change', () => { updatePrice(); updateSummary(); });
    document.getElementById('pickupTime').addEventListener('change', () => { updatePrice(); updateSummary(); });
    document.querySelectorAll('input[name="payment"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            selectedPayment = e.target.value;
            const onlineDetails = document.getElementById('onlinePaymentDetails');
            if (selectedPayment === 'online') {
                if (onlineDetails) onlineDetails.style.display = 'block';
            } else {
                if (onlineDetails) onlineDetails.style.display = 'none';
            }
        });
    });
}

function setupSteps() {
    showStep(1);
    document.querySelectorAll('.step').forEach((step, idx) => {
        const btn = step.querySelector('button');
        if (btn && btn.classList.contains('next-step')) {
            btn.onclick = () => nextStep(idx + 1);
        }
    });
}

function goToStep(stepNumber) {
    if (stepNumber === 2 && !validateStep1()) { alert('Please calculate route first'); return; }
    if (stepNumber === 3 && !validateStep2()) { alert('Please select a vehicle'); return; }
    if (stepNumber === 4 && !validateStep3()) { alert('Please fill all trip details'); return; }
    showStep(stepNumber);
}

function showStep(stepNumber) {
    document.querySelectorAll('.step-content').forEach(step => step.classList.remove('active'));
    document.getElementById(`step-${stepNumber}`).classList.add('active');
    document.querySelectorAll('.step').forEach((step, index) => {
        step.classList.toggle('active', index + 1 <= stepNumber);
    });
    currentStep = stepNumber;
    scrollToTop();
    if (stepNumber === 1 && map) setTimeout(() => map.invalidateSize(), 200);
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function prevStep() { if (currentStep > 1) showStep(currentStep - 1); }
function nextStep(step) { goToStep(step); }

// ========== AUTOCOMPLETE ==========
function initializeAutocomplete() {
    setupAutocomplete('pickup', 'pickupSuggestions');
    setupAutocomplete('destination', 'destinationSuggestions');
}

function setupAutocomplete(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);
    let timeoutId;

    input.addEventListener('input', function() {
        clearTimeout(timeoutId);
        const query = this.value.trim();
        if (query.length < 3) {
            suggestions.innerHTML = '';
            suggestions.style.display = 'none';
            return;
        }
        timeoutId = setTimeout(() => fetchSuggestions(query, inputId, suggestions), 500);
    });

    suggestions.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (item) {
            const name = item.querySelector('.suggestion-main').textContent;
            input.value = name;
            suggestions.style.display = 'none';
            if (item.dataset.lat && item.dataset.lon) {
                input.dataset.lat = item.dataset.lat;
                input.dataset.lon = item.dataset.lon;
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.style.display = 'none';
        }
    });
}

async function fetchSuggestions(query, inputId, suggestionsContainer) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5`
        );
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        if (!data.length) {
            suggestionsContainer.innerHTML = '<div class="suggestion-item">No results found</div>';
            suggestionsContainer.style.display = 'block';
            return;
        }
        suggestionsContainer.innerHTML = data.map(item => `
            <div class="suggestion-item" data-lat="${item.lat}" data-lon="${item.lon}">
                <i class="fas fa-map-marker-alt"></i>
                <div>
                    <div class="suggestion-main">${item.display_name}</div>
                    <div class="suggestion-details">${item.lat}, ${item.lon}</div>
                </div>
            </div>
        `).join('');
        suggestionsContainer.style.display = 'block';
    } catch (error) {
        console.error('Autocomplete error:', error);
        suggestionsContainer.innerHTML = '<div class="suggestion-item"><i class="fas fa-exclamation-circle"></i> Error loading</div>';
        suggestionsContainer.style.display = 'block';
    }
}

// ========== DISTANCE CALCULATION ==========
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
function calculateRoadDistance(pickupCoords, destCoords) {
    return calculateHaversineDistance(pickupCoords.lat, pickupCoords.lon, destCoords.lat, destCoords.lon) * 1.3;
}

async function calculateRoute() {
    const pickup = document.getElementById('pickup').value.trim();
    const destination = document.getElementById('destination').value.trim();
    if (!pickup || !destination) { alert('Please enter both pickup and destination'); return; }
    if (pickup === destination) { alert('Pickup and destination cannot be the same'); return; }

    const btn = document.querySelector('.calculate-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating route...';
    btn.disabled = true;

    try {
        const pickupCoords = await getCoordinates(pickup, 'pickup');
        const destCoords = await getCoordinates(destination, 'destination');
        if (!pickupCoords || !destCoords) throw new Error('Could not get coordinates');

        currentDistance = calculateRoadDistance(pickupCoords, destCoords);
        updateMapRoute(pickupCoords, destCoords);
        updateRouteInfo(currentDistance);
        if (selectedVehicle) { updatePrice(); updateSummary(); }
        updatePreview();
    } catch (error) {
        console.error(error);
        alert('Error calculating route. Please check locations and try again.');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

async function getCoordinates(location, elementId) {
    const input = document.getElementById(elementId);
    if (input.dataset.lat && input.dataset.lon) {
        return { lat: parseFloat(input.dataset.lat), lon: parseFloat(input.dataset.lon), name: location };
    }
    try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&countrycodes=in&limit=1`);
        const data = await resp.json();
        if (data.length) {
            input.dataset.lat = data[0].lat;
            input.dataset.lon = data[0].lon;
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
        }
    } catch (err) {}
    const fallback = {
        'dehradun': [30.3165,78.0322], 'mussoorie':[30.4598,78.0644],
        'delhi':[28.6139,77.2090], 'rishikesh':[30.0869,78.2676], 'haridwar':[29.9457,78.1642]
    };
    const key = Object.keys(fallback).find(k => location.toLowerCase().includes(k));
    if (key) {
        input.dataset.lat = fallback[key][0];
        input.dataset.lon = fallback[key][1];
        return { lat: fallback[key][0], lon: fallback[key][1], name: location };
    }
    input.dataset.lat = 30.3165; input.dataset.lon = 78.0322;
    return { lat: 30.3165, lon: 78.0322, name: location };
}

function updateMapRoute(pickupCoords, destCoords) {
    clearRoute();
    const pickupIcon = L.divIcon({ className: 'custom-marker', html: '<i class="fas fa-map-marker-alt" style="color:#00bf72; font-size:32px;"></i>', iconSize: [32,32], iconAnchor: [16,32] });
    const destIcon = L.divIcon({ className: 'custom-marker', html: '<i class="fas fa-flag-checkered" style="color:#e74c3c; font-size:32px;"></i>', iconSize: [32,32], iconAnchor: [16,32] });
    pickupMarker = L.marker([pickupCoords.lat, pickupCoords.lon], { icon: pickupIcon }).addTo(map).bindPopup(`<b>Pickup:</b> ${pickupCoords.name}`).openPopup();
    destinationMarker = L.marker([destCoords.lat, destCoords.lon], { icon: destIcon }).addTo(map).bindPopup(`<b>Destination:</b> ${destCoords.name}`);
    routeControl = L.polyline([[pickupCoords.lat, pickupCoords.lon], [destCoords.lat, destCoords.lon]], { color: '#004d7a', weight: 4, opacity: 0.7, dashArray: '10, 10' }).addTo(map);
    const bounds = L.latLngBounds([[pickupCoords.lat, pickupCoords.lon], [destCoords.lat, destCoords.lon]]);
    map.fitBounds(bounds, { padding: [50,50] });
}

function clearRoute() {
    if (routeControl) map.removeLayer(routeControl);
    if (pickupMarker) map.removeLayer(pickupMarker);
    if (destinationMarker) map.removeLayer(destinationMarker);
    routeControl = pickupMarker = destinationMarker = null;
    if (map) map.setView([30.3165, 78.0322], 13);
}

function showRouteOnMap() { if (pickupMarker && destinationMarker) zoomToRoute(); else calculateRoute(); }
function zoomToRoute() {
    if (pickupMarker && destinationMarker) {
        const bounds = L.latLngBounds([pickupMarker.getLatLng(), destinationMarker.getLatLng()]);
        map.fitBounds(bounds, { padding: [50,50] });
    }
}

function updateRouteInfo(distance) {
    document.getElementById('mapDistance').innerText = `${distance.toFixed(1)} km`;
    const tolls = Math.max(1, Math.floor(distance / 50));
    document.getElementById('mapTolls').innerText = tolls;
    document.getElementById('previewDistance').innerText = `${distance.toFixed(1)} km`;
}

// ========== VEHICLE SELECTION ==========
function selectVehicle(vehicleType) {
    selectedVehicle = vehicleType;
    document.querySelectorAll('.vehicle-option').forEach(opt => opt.classList.remove('selected'));
    const selectedOpt = document.querySelector(`.vehicle-option[data-vehicle="${vehicleType}"]`);
    if (selectedOpt) selectedOpt.classList.add('selected');
    document.getElementById('previewVehicle').innerText = fareConfig[vehicleType].name;
    updatePrice();
    updatePassengerLimit();
    updateSummary();
}

function updatePassengerLimit() {
    if (!selectedVehicle) return;
    const vehicle = fareConfig[selectedVehicle];
    const passengersInput = document.getElementById('passengers');
    passengersInput.max = vehicle.capacity;
    if (parseInt(passengersInput.value) > vehicle.capacity) passengersInput.value = vehicle.capacity;
    const note = document.querySelector('.passenger-note');
    if (note) note.innerText = `Max: ${vehicle.capacity} passengers`;
}

// ========== FARE CALCULATION ==========
function updatePrice() {
    if (!selectedVehicle || currentDistance === 0) return;
    const vehicle = fareConfig[selectedVehicle];
    const tripType = document.getElementById('tripType').value;
    let tripDays = parseInt(document.getElementById('tripDays').value) || 1;
    const pickupTime = document.getElementById('pickupTime').value;

    let baseFare = vehicle.baseFare;
    let distanceFare = currentDistance * vehicle.perKm;
    let tollCharges = currentDistance * TOLL_RATE_PER_KM;
    let driverAllowance = DRIVER_ALLOWANCE_PER_DAY * (tripType === 'multiday' ? tripDays : 1);
    let nightCharges = 0;
    if (pickupTime) {
        const hour = parseInt(pickupTime.split(':')[0]);
        if (hour >= nightHours.start || hour < nightHours.end) {
            nightCharges = (baseFare + distanceFare) * (vehicle.nightCharge - 1);
        }
    }
    let oneWaySubtotal = baseFare + distanceFare + tollCharges + driverAllowance + nightCharges;
    let subtotal;
    if (tripType === 'round_trip') subtotal = oneWaySubtotal * 1.7;
    else if (tripType === 'one_way') subtotal = oneWaySubtotal;
    else if (tripType === 'daily') subtotal = vehicle.baseFare * 8 * tripDays;
    else if (tripType === 'multiday') subtotal = vehicle.baseFare * 10 * tripDays;
    else subtotal = oneWaySubtotal;

    let gstAmount = subtotal * GST_RATE;
    let totalAmount = subtotal + gstAmount;
    const minFare = vehicle.baseFare + (vehicle.minimumDistance * vehicle.perKm);
    if (totalAmount < minFare) totalAmount = minFare;

    let finalTotal = Math.round(totalAmount);
    let baseFareRounded = Math.round(baseFare);
    let distanceFareRounded = Math.round(distanceFare);
    let tollRounded = Math.round(tollCharges);
    let driverRounded = Math.round(driverAllowance);
    let nightRounded = Math.round(nightCharges);
    let gstRounded = Math.round(gstAmount);

    document.getElementById('detailBaseFare').innerHTML = `₹ ${baseFareRounded.toLocaleString()}`;
    document.getElementById('detailDistanceFare').innerHTML = `₹ ${distanceFareRounded.toLocaleString()}`;
    document.getElementById('detailTripSurcharge').innerHTML = `₹ 0`;
    document.getElementById('detailTollCharges').innerHTML = `₹ ${tollRounded.toLocaleString()}`;
    document.getElementById('detailDriverAllowance').innerHTML = `₹ ${driverRounded.toLocaleString()}`;
    document.getElementById('detailNightCharges').innerHTML = `₹ ${nightRounded.toLocaleString()}`;
    document.getElementById('detailGST').innerHTML = `₹ ${gstRounded.toLocaleString()}`;
    document.getElementById('detailTotal').innerHTML = `₹ ${finalTotal.toLocaleString()}`;
    document.getElementById('previewTotal').innerHTML = `₹ ${finalTotal.toLocaleString()}`;
    document.getElementById('summaryTotal').innerHTML = `₹ ${finalTotal.toLocaleString()}`;

    updateAllVehiclePrices();
}

function updateAllVehiclePrices() {
    if (currentDistance === 0) return;
    const tripType = document.getElementById('tripType').value;
    const tripDays = parseInt(document.getElementById('tripDays').value) || 1;
    const pickupTime = document.getElementById('pickupTime').value;

    Object.keys(fareConfig).forEach(vehicleType => {
        const v = fareConfig[vehicleType];
        let base = v.baseFare;
        let distance = currentDistance * v.perKm;
        let toll = currentDistance * TOLL_RATE_PER_KM;
        let driver = DRIVER_ALLOWANCE_PER_DAY * (tripType === 'multiday' ? tripDays : 1);
        let night = 0;
        if (pickupTime) {
            const hour = parseInt(pickupTime.split(':')[0]);
            if (hour >= nightHours.start || hour < nightHours.end) {
                night = (base + distance) * (v.nightCharge - 1);
            }
        }
        let oneWayTotal = base + distance + toll + driver + night;
        let finalTotal;
        if (tripType === 'round_trip') finalTotal = oneWayTotal * 1.8;
        else if (tripType === 'one_way') finalTotal = oneWayTotal;
        else if (tripType === 'daily') finalTotal = v.baseFare * 8 * tripDays;
        else if (tripType === 'multiday') finalTotal = v.baseFare * 10 * tripDays;
        else finalTotal = oneWayTotal;
        finalTotal = Math.round(finalTotal + (finalTotal * GST_RATE));
        const minFare = v.baseFare + (v.minimumDistance * v.perKm);
        if (finalTotal < minFare) finalTotal = minFare;
        const priceSpan = document.getElementById(`${vehicleType}Price`);
        if (priceSpan) priceSpan.innerText = `₹ ${finalTotal.toLocaleString()}`;
    });
}

function updatePreview() {
    if (currentDistance === 0) return;
    document.getElementById('previewDistance').innerText = `${currentDistance.toFixed(1)} km`;
    if (selectedVehicle) {
        document.getElementById('previewVehicle').innerText = fareConfig[selectedVehicle].name;
        updatePrice();
    }
}

function updateSummary() {
    if (!selectedVehicle || currentDistance === 0) return;
    const vehicle = fareConfig[selectedVehicle];
    const date = document.getElementById('travelDate').value;
    const time = document.getElementById('pickupTime').value;
    const passengers = document.getElementById('passengers').value;
    const totalElem = document.getElementById('detailTotal');
    const total = totalElem ? totalElem.innerHTML : '₹ 0';
    const formattedDate = date ? new Date(date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '--';
    document.getElementById('summaryRoute').innerHTML = `${document.getElementById('pickup').value} → ${document.getElementById('destination').value}`;
    document.getElementById('summaryVehicle').innerText = vehicle.name;
    document.getElementById('summaryDate').innerText = formattedDate;
    document.getElementById('summaryTime').innerText = time || '--';
    document.getElementById('summaryPassengers').innerText = passengers;
    document.getElementById('summaryDistance').innerText = `${currentDistance.toFixed(1)} km`;
    document.getElementById('summaryTotal').innerHTML = total;
}

function updateTripType() {
    const tripType = document.getElementById('tripType').value;
    const daysGroup = document.getElementById('tripDays').closest('.form-group');
    if (tripType === 'multiday') {
        if (daysGroup) daysGroup.style.display = 'block';
    } else {
        if (daysGroup) daysGroup.style.display = 'none';
        document.getElementById('tripDays').value = 1;
    }
    updatePrice();
    updateSummary();
}

function setDefaultDateTime() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateInput = document.getElementById('travelDate');
    dateInput.min = tomorrow.toISOString().split('T')[0];
    dateInput.value = tomorrow.toISOString().split('T')[0];
    document.getElementById('pickupTime').value = '09:00';
}

// ========== OTP & EMAIL ==========
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendEmailOTP(customerEmail, customerName, bookingData, otp) {
    const templateParams = {
        email: customerEmail,
        customer_name: customerName,
        booking_id: bookingData.bookingId,
        pickup: bookingData.pickup,
        destination: bookingData.destination,
        vehicle: bookingData.vehicle,
        fare: bookingData.fare,
        date: bookingData.date,
        otp: otp
    };
    emailjs.send('service_j7b19kn', 'template_5lug4bk', templateParams)
        .then(() => console.log('✅ OTP email sent to', customerEmail))
        .catch(err => console.error('❌ EmailJS error:', err));
}

async function saveBookingToFirebase(bookingData, otp, otpExpiry) {
    try {
        await db.collection("bookings").doc(bookingData.bookingId).set({
            ...bookingData,
            otp: otp,
            otpExpiry: firebase.firestore.Timestamp.fromDate(otpExpiry),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: "pending"
        });
        console.log("Booking saved to Firebase");
        return true;
    } catch (error) {
        console.error("Firebase save error:", error);
        return false;
    }
}

// ========== MAIN SUBMIT ==========
async function submitBooking(event) {
    if (event) event.preventDefault();

    if (!validateStep1()) { alert('Please calculate route first'); showStep(1); return; }
    if (!validateStep2()) { alert('Please select a vehicle'); showStep(2); return; }
    if (!validateStep3()) { alert('Please fill all trip details correctly'); showStep(3); return; }
    if (!document.getElementById('agreeTerms').checked) { alert('Please accept terms & conditions'); return; }

    const customerName = document.getElementById('fullName').value.trim();
    const customerEmail = document.getElementById('email').value.trim();
    const customerPhone = document.getElementById('phone').value.trim();
    const pickup = document.getElementById('pickup').value.trim();
    const destination = document.getElementById('destination').value.trim();
    const vehicleName = selectedVehicle ? fareConfig[selectedVehicle].name : '';
    const fare = document.getElementById('detailTotal').innerHTML;
    const travelDate = document.getElementById('travelDate').value;
    const pickupTime = document.getElementById('pickupTime').value;

    if (!customerName || !customerEmail || !customerPhone || !pickup || !destination) {
        alert('All fields are required');
        return;
    }
    if (!/^\d{10}$/.test(customerPhone)) { alert('Enter valid 10-digit phone number'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) { alert('Enter valid email'); return; }

    const bookingId = 'AA' + Date.now().toString().slice(-8);
    const otp = generateOTP();
    currentOtp = otp;
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 15);

    const bookingData = {
        bookingId: bookingId, customerName, customerEmail, customerPhone,
        pickup, destination, vehicle: vehicleName, fare, date: travelDate, time: pickupTime,
        paymentMethod: selectedPayment
    };

    const submitBtn = document.querySelector('.submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    submitBtn.disabled = true;

    const saved = await saveBookingToFirebase(bookingData, otp, otpExpiry);
    if (saved) {
        sendEmailOTP(customerEmail, customerName, bookingData, otp);
        const existingBookings = JSON.parse(localStorage.getItem('admin_bookings') || '[]');
        existingBookings.push({ id: bookingId, customer: customerName, phone: customerPhone, pickup, destination, vehicle: vehicleName, fare, date: travelDate, status: 'pending' });
        localStorage.setItem('admin_bookings', JSON.stringify(existingBookings));

        document.getElementById('bookingId').innerText = bookingId;
        document.getElementById('modalRoute').innerHTML = `${pickup.split(',')[0]} → ${destination.split(',')[0]}`;
        const formattedDate = new Date(travelDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
        document.getElementById('modalDate').innerText = formattedDate;
        document.getElementById('modalVehicle').innerText = vehicleName;
        document.getElementById('modalAmount').innerHTML = fare;
        document.getElementById('modalPayment').innerText = selectedPayment === 'cash' ? 'Cash' : 'UPI / Online';
        document.getElementById('modalOtp').innerText = otp; // store for invoice
        document.getElementById('successModal').style.display = 'flex';
    } else {
        alert('Booking failed. Please try again.');
    }
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
}

// ========== HELPER FUNCTIONS ==========
function validateStep1() { return currentDistance > 0; }
function validateStep2() { return selectedVehicle !== null; }
function validateStep3() {
    const name = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const date = document.getElementById('travelDate').value;
    const time = document.getElementById('pickupTime').value;
    if (!name || !phone || !email || !date || !time) return false;
    if (!/^\d{10}$/.test(phone)) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    return true;
}

function resetBooking() {
    if (!confirm('Reset all booking data?')) return;
    document.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type !== 'button' && el.id !== 'agreeTerms') el.value = '';
        if (el.id === 'agreeTerms') el.checked = false;
    });
    if (document.getElementById('pickup')) delete document.getElementById('pickup').dataset.lat;
    if (document.getElementById('destination')) delete document.getElementById('destination').dataset.lon;
    selectedVehicle = null; selectedPayment = 'cash'; currentDistance = 0;
    clearRoute(); setDefaultDateTime();
    document.querySelectorAll('.vehicle-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('selected'));
    const cashRadio = document.getElementById('cash');
    if (cashRadio) cashRadio.checked = true;
    const onlineDetails = document.getElementById('onlinePaymentDetails');
    if (onlineDetails) onlineDetails.style.display = 'none';
    const daysGroup = document.getElementById('tripDays').closest('.form-group');
    if (daysGroup) daysGroup.style.display = 'none';
    showStep(1);
    const resetIds = ['mapDistance','mapTolls','previewDistance','previewVehicle','previewTotal',
        'detailBaseFare','detailDistanceFare','detailTripSurcharge','detailTollCharges',
        'detailDriverAllowance','detailNightCharges','detailGST','detailTotal',
        'summaryRoute','summaryVehicle','summaryDate','summaryTime','summaryPassengers',
        'summaryDistance','summaryTotal'];
    resetIds.forEach(id => { const el = document.getElementById(id); if (el) { if (id.includes('total')) el.innerHTML = '₹ 0'; else if (id === 'previewVehicle') el.innerText = '--'; else el.innerText = id.includes('Distance') ? '-- km' : (id.includes('summaryRoute') ? '-- → --' : '--'); } });
    alert('Booking reset. Start a new booking.');
}

function getCurrentLocation(inputId) {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    const input = document.getElementById(inputId);
    input.value = 'Getting location...';
    navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        input.dataset.lat = lat; input.dataset.lon = lon;
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await resp.json();
            input.value = data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        } catch { input.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
    }, () => { alert('Location failed'); input.value = ''; });
}

function setRoute(pickup, dest) {
    document.getElementById('pickup').value = pickup;
    document.getElementById('destination').value = dest;
    setTimeout(() => calculateRoute(), 300);
}

function showTerms() {
    alert(`TERMS & CONDITIONS\n\n1. Free cancellation 24+ hours before pickup.\n2. Night charges (10PM-6AM): 25% extra.\n3. Minimum fare for 50 km.\n4. GST 5% extra.\n5. Driver details shared 1 hour before ride.\n\nContact: +91 9756354502 / algomaster18@gmail.com`);
    return false;
}

function closeModal() { document.getElementById('successModal').style.display = 'none'; }
function printBooking() { window.print(); }
function shareBooking() {
    const text = `A&A Travels Booking\nID: ${document.getElementById('bookingId').innerText}\nRoute: ${document.getElementById('modalRoute').innerText}\nAmount: ${document.getElementById('modalAmount').innerText}`;
    if (navigator.share) navigator.share({ title: 'Booking', text });
    else navigator.clipboard.writeText(text).then(() => alert('Copied!'));
}

// ========== COPY UPI ==========
function copyUPI() {
    const upiId = "7906529891@ptsbi";
    navigator.clipboard.writeText(upiId);
    alert('UPI ID copied: ' + upiId);
}

// ========== ENHANCED DECORATIVE INVOICE GENERATION ==========
function generateInvoiceHTML(bookingData, otp) {
    const fareAmount = bookingData.fare.replace('₹', '').trim();
    const gstAmount = (parseFloat(fareAmount) * 0.05).toFixed(0);
    const subtotal = parseFloat(fareAmount) - gstAmount;
    const invoiceNo = 'INV-' + bookingData.bookingId;
    const currentDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Invoice - A and A Travels</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', 'Poppins', 'Arial', sans-serif;
                background: #eef2f7;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                padding: 30px;
            }
            .invoice-wrapper {
                max-width: 900px;
                width: 100%;
                background: white;
                border-radius: 24px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                transition: transform 0.2s;
            }
            .invoice-header {
                background: linear-gradient(135deg, #004d7a, #008793);
                padding: 30px 40px;
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 20px;
            }
            .brand h1 {
                font-size: 28px;
                letter-spacing: 1px;
                margin-bottom: 5px;
            }
            .brand p {
                opacity: 0.85;
                font-size: 14px;
            }
            .invoice-title {
                text-align: right;
            }
            .invoice-title h2 {
                font-size: 28px;
                font-weight: 600;
                letter-spacing: 2px;
            }
            .invoice-title p {
                font-size: 14px;
                opacity: 0.9;
            }
            .invoice-body {
                padding: 40px;
            }
            .info-grid {
                display: flex;
                justify-content: space-between;
                margin-bottom: 35px;
                flex-wrap: wrap;
                gap: 20px;
                background: #f8fafc;
                padding: 20px;
                border-radius: 16px;
            }
            .info-box h4 {
                color: #004d7a;
                margin-bottom: 8px;
                font-size: 16px;
                border-left: 3px solid #00bf72;
                padding-left: 10px;
            }
            .info-box p {
                color: #2c3e50;
                margin: 5px 0;
                font-size: 14px;
            }
            .customer-details {
                background: #f1f5f9;
                padding: 20px;
                border-radius: 16px;
                margin-bottom: 30px;
            }
            .customer-details h3 {
                color: #004d7a;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .trip-table, .fare-table {
                width: 100%;
                border-collapse: collapse;
                margin: 25px 0;
            }
            .trip-table th, .fare-table th {
                background: #e9ecef;
                color: #004d7a;
                padding: 12px;
                text-align: left;
                font-weight: 600;
            }
            .trip-table td, .fare-table td {
                padding: 10px 12px;
                border-bottom: 1px solid #dee2e6;
                color: #2c3e50;
            }
            .fare-table td:last-child {
                font-weight: 500;
            }
            .totals {
                text-align: right;
                margin-top: 20px;
                border-top: 2px solid #e2e8f0;
                padding-top: 20px;
            }
            .grand-total {
                font-size: 22px;
                font-weight: 800;
                color: #004d7a;
                margin-top: 10px;
            }
            .otp-section {
                background: linear-gradient(145deg, #fff3cd, #ffe8a1);
                padding: 20px;
                border-radius: 16px;
                text-align: center;
                margin: 30px 0;
                border: 1px solid #ffc107;
            }
            .otp-code {
                font-size: 36px;
                font-weight: 800;
                letter-spacing: 8px;
                color: #b45f06;
                background: white;
                display: inline-block;
                padding: 10px 25px;
                border-radius: 50px;
                margin: 10px 0;
                font-family: monospace;
            }
            .footer {
                background: #f8fafc;
                padding: 25px;
                text-align: center;
                font-size: 13px;
                color: #5a6e7f;
                border-top: 1px solid #e2e8f0;
            }
            .watermark {
                text-align: center;
                font-size: 11px;
                color: #94a3b8;
                margin-top: 15px;
            }
            @media print {
                body { background: white; padding: 0; }
                .invoice-wrapper { box-shadow: none; margin: 0; }
                .invoice-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .otp-section { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        </style>
    </head>
    <body>
        <div class="invoice-wrapper">
            <div class="invoice-header">
                <div class="brand">
                    <h1>🚐 A and A Travels</h1>
                    <p>Your Journey, Our Care</p>
                </div>
                <div class="invoice-title">
                    <h2>TAX INVOICE</h2>
                    <p>Original Copy</p>
                </div>
            </div>
            <div class="invoice-body">
                <div class="info-grid">
                    <div class="info-box">
                        <h4>📄 Invoice Details</h4>
                        <p><strong>Invoice No:</strong> ${invoiceNo}</p>
                        <p><strong>Date:</strong> ${currentDate}</p>
                        <p><strong>Booking ID:</strong> ${bookingData.bookingId}</p>
                    </div>
                    <div class="info-box">
                        <h4>🏢 Business Info</h4>
                        <p>A and A Travels</p>
                        <p>Hathibarkala, Dehradun</p>
                        <p>Uttarakhand - 248001</p>
                        <p>GST: 05AAACA1234A1Z</p>
                    </div>
                </div>

                <div class="customer-details">
                    <h3><i class="fas fa-user-circle"></i> Customer Information</h3>
                    <p><strong>Name:</strong> ${escapeHtml(bookingData.customerName)}</p>
                    <p><strong>Phone:</strong> ${bookingData.customerPhone}</p>
                    <p><strong>Email:</strong> ${bookingData.customerEmail}</p>
                </div>

                <h3>🚗 Trip Details</h3>
                <table class="trip-table">
                    <thead><tr><th>Description</th><th>Details</th></tr></thead>
                    <tbody>
                        <tr><td>Pickup Location</td><td>${escapeHtml(bookingData.pickup)}</td></tr>
                        <tr><td>Destination</td><td>${escapeHtml(bookingData.destination)}</td></tr>
                        <tr><td>Vehicle Type</td><td>${bookingData.vehicle}</td></tr>
                        <tr><td>Travel Date</td><td>${bookingData.date}</td></tr>
                        <tr><td>Pickup Time</td><td>${bookingData.time}</td></tr>
                    </tbody>
                </table>

                <h3>💰 Fare Breakdown</h3>
                <table class="fare-table">
                    <thead><tr><th>Particulars</th><th>Amount (₹)</th></tr></thead>
                    <tbody>
                        <tr><td>Base Fare</td><td>₹ ${subtotal}</td></tr>
                        <tr><td>GST (5%)</td><td>₹ ${gstAmount}</td></tr>
                        <tr style="font-weight: bold; background: #f1f5f9;"><td>Total Payable</td><td>${bookingData.fare}</td></tr>
                    </tbody>
                </table>

                <div class="otp-section">
                    <p><strong>🔐 Booking OTP (for driver verification)</strong></p>
                    <div class="otp-code">${otp}</div>
                    <p>Valid for 15 minutes from booking time.<br>Please share this OTP with driver at pickup.</p>
                </div>

                <div class="totals">
                    <p><strong>Payment Mode:</strong> ${bookingData.paymentMethod === 'cash' ? 'Cash on Trip' : 'Online Payment (UPI)'}</p>
                    <p><strong>Payment Status:</strong> ${bookingData.paymentMethod === 'cash' ? 'Pending' : 'Completed'}</p>
                    <p class="grand-total">Total Invoice Amount: ${bookingData.fare}</p>
                </div>
            </div>
            <div class="footer">
                <p>Thank you for choosing A and A Travels</p>
                <p>For support: +91 9756354502 | algomaster18@gmail.com</p>
                <div class="watermark">This is a computer generated invoice – valid without signature</div>
            </div>
        </div>
    </body>
    </html>`;
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

function downloadInvoice() {
    const bookingData = {
        bookingId: document.getElementById('bookingId').innerText,
        customerName: document.getElementById('fullName').value,
        customerPhone: document.getElementById('phone').value,
        customerEmail: document.getElementById('email').value,
        pickup: document.getElementById('pickup').value,
        destination: document.getElementById('destination').value,
        vehicle: selectedVehicle ? fareConfig[selectedVehicle].name : '',
        fare: document.getElementById('modalAmount').innerText,
        date: document.getElementById('modalDate').innerText,
        time: document.getElementById('pickupTime').value,
        paymentMethod: selectedPayment
    };
    const otp = document.getElementById('modalOtp')?.innerText || 'NA';
    const invoiceHTML = generateInvoiceHTML(bookingData, otp);
    const win = window.open();
    win.document.write(invoiceHTML);
    win.document.close();
    win.print(); // Opens print dialog; user can save as PDF
}

// ========== INITIALIZE ==========
window.onload = () => {
    initMap();
    setupSteps();
    window.calculateRoute = calculateRoute;
    window.selectVehicle = selectVehicle;
    window.nextStep = nextStep;
    window.prevStep = prevStep;
    window.updateTripType = updateTripType;
    window.updateDate = updatePrice;
    window.updateTime = updatePrice;
    window.updatePassengers = updatePrice;
    window.submitBooking = submitBooking;
    window.closeModal = closeModal;
    window.printBooking = printBooking;
    window.shareBooking = shareBooking;
    window.selectPayment = (method) => { selectedPayment = method; };
    window.getCurrentLocation = getCurrentLocation;
    window.setRoute = setRoute;
    window.showRouteOnMap = showRouteOnMap;
    window.clearRoute = clearRoute;
    window.zoomToRoute = zoomToRoute;
    window.showTerms = showTerms;
    window.resetBooking = resetBooking;
    window.copyUPI = copyUPI;
    window.downloadInvoice = downloadInvoice;
};