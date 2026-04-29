// contact.js - Map, form handling, and Firestore saving

let contactMap;

function initContactMap() {
    const mapContainer = document.getElementById('officeMap');
    if (!mapContainer) return;

    const officeLat = 30.34926;
    const officeLon = 78.05395;

    contactMap = L.map('officeMap').setView([officeLat, officeLon], 15);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(contactMap);

    tiles.on('tileerror', function() {
        contactMap.eachLayer(layer => contactMap.removeLayer(layer));
        L.tileLayer('https://tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors, Tiles style by HOT'
        }).addTo(contactMap);
        console.warn('Switched to fallback map tiles');
    });

    const officeIcon = L.divIcon({
        className: 'custom-marker',
        html: '<i class="fas fa-map-marker-alt" style="color:#e74c3c; font-size:32px;"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });
    L.marker([officeLat, officeLon], { icon: officeIcon })
        .addTo(contactMap)
        .bindPopup('<b>A and A Travels</b><br>Hathibarkala, Dehradun<br>Uttarakhand, India')
        .openPopup();
}

async function handleContactForm(e) {
    e.preventDefault();

    if (typeof db === 'undefined') {
        showFormStatus('Firebase not loaded. Please refresh.', 'error');
        return;
    }

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value.trim();

    if (!name || !email || !subject || !message) {
        showFormStatus('Please fill all required fields.', 'error');
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showFormStatus('Please enter a valid email address.', 'error');
        return;
    }

    const submitBtn = document.querySelector('.submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;

    try {
        // Create a simple object
        const enquiryData = {
            name: name,
            email: email,
            phone: phone,
            subject: subject,
            message: message,
            createdAt: new Date(),  // easier than server timestamp for testing
            handled: false
        };
        
        console.log("Attempting to save:", enquiryData);
        
        // Save to Firestore
        const docRef = await db.collection('enquiries').add(enquiryData);
        console.log("✅ Enquiry saved with ID:", docRef.id);
        
        // Optional: also save to localStorage for backup
        let localEnquiries = JSON.parse(localStorage.getItem('local_enquiries') || '[]');
        localEnquiries.push({ ...enquiryData, id: docRef.id });
        localStorage.setItem('local_enquiries', JSON.stringify(localEnquiries));
        
        // Show success modal
        document.getElementById('contactSuccessModal').style.display = 'flex';
        document.getElementById('contactForm').reset();
    } catch (error) {
        console.error("❌ Firestore error:", error);
        showFormStatus('Error: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showFormStatus(message, type) {
    const statusDiv = document.getElementById('formStatus');
    statusDiv.textContent = message;
    statusDiv.className = `form-status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => statusDiv.style.display = 'none', 5000);
}

function closeContactModal() {
    document.getElementById('contactSuccessModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('contactSuccessModal');
    if (event.target === modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', function() {
    initContactMap();
    const form = document.getElementById('contactForm');
    if (form) form.addEventListener('submit', handleContactForm);
});