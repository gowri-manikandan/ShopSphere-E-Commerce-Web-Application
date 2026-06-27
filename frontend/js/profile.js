import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, showLoader, hideLoader } from './ui.js';
import { API_BASE } from './config.js';

// Dom elements references
const avatarImg = document.getElementById('avatar-image');
const avatarPlaceholder = document.getElementById('avatar-placeholder');
const avatarUploadInput = document.getElementById('avatar-upload-input');
const displayName = document.getElementById('profile-display-name');
const displayEmail = document.getElementById('profile-display-email');
const displayRole = document.getElementById('profile-display-role');

const detailsForm = document.getElementById('profile-details-form');
const nameInput = document.getElementById('profile-name-input');
const emailInput = document.getElementById('profile-email-input');

const changePasswordForm = document.getElementById('change-password-form');
const oldPasswordInput = document.getElementById('old-password-input');
const newPasswordInput = document.getElementById('new-password-input');
const confirmPasswordInput = document.getElementById('confirm-password-input');
const newPassStrengthContainer = document.getElementById('new-pass-strength-container');
const newPassStrengthFill = document.getElementById('new-pass-strength-fill');
const newPassStrengthText = document.getElementById('new-pass-strength-text');

const addressesContainer = document.getElementById('addresses-container');
const addAddressForm = document.getElementById('add-address-form');
const addressLine1 = document.getElementById('address-line1');
const addressPhone = document.getElementById('address-phone');
const addressCity = document.getElementById('address-city');
const addressState = document.getElementById('address-state');
const addressPincode = document.getElementById('address-pincode');

let currentProfileImageUrl = '';

// Load all profile info on init
document.addEventListener('DOMContentLoaded', () => {
    // Check auth
    if (!auth.isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }
    initProfile();
});

async function initProfile() {
    try {
        showLoader();
        await loadProfileInfo();
        await loadAddresses();
        setupChangePasswordStrength();
        setupDetailsUpdate();
        setupPasswordChange();
        setupAddressCreation();
        setupAvatarUpload();
    } catch (err) {
        showToast('Error loading profile page.', 'error');
        console.error(err);
    } finally {
        hideLoader();
    }
}

// Fetch Profile info and populate inputs
async function loadProfileInfo() {
    const user = await api.get('/api/users/profile');
    
    displayName.textContent = user.name || 'Anonymous';
    displayEmail.textContent = user.email;
    displayRole.textContent = user.role || 'CUSTOMER';

    nameInput.value = user.name || '';
    emailInput.value = user.email || '';
    
    currentProfileImageUrl = user.profileImageUrl || '';
    if (user.profileImageUrl) {
        avatarImg.src = user.profileImageUrl;
        avatarImg.style.display = 'block';
        avatarPlaceholder.style.display = 'none';
    } else {
        avatarImg.style.display = 'none';
        avatarPlaceholder.style.display = 'flex';
        avatarPlaceholder.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
    }
}

// Load user shipping addresses
async function loadAddresses() {
    addressesContainer.innerHTML = '<p class="loader-text">Loading addresses...</p>';
    try {
        const addresses = await api.get('/api/addresses');
        addressesContainer.innerHTML = '';
        
        if (!addresses || addresses.length === 0) {
            addressesContainer.innerHTML = `
                <p class="empty-desc" style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 20px 0;">
                    No shipping addresses saved yet.
                </p>
            `;
            return;
        }

        addresses.forEach(addr => {
            const card = document.createElement('div');
            card.className = 'address-item-card';
            card.innerHTML = `
                <p style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${addr.line1}</p>
                <p style="font-size: 13px; color: var(--text-muted);">${addr.city}, ${addr.state} - ${addr.pincode}</p>
                <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;"><strong style="font-weight: 600;">Phone:</strong> ${addr.phone}</p>
                <button class="address-delete-btn" data-id="${addr.id}" title="Delete Address">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            `;
            addressesContainer.appendChild(card);
        });

        // Add delete address click handlers
        const deleteButtons = addressesContainer.querySelectorAll('.address-delete-btn');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this address?')) {
                    try {
                        showLoader();
                        await api.delete(`/api/addresses/${id}`);
                        showToast('Address deleted successfully!', 'success');
                        await loadAddresses();
                    } catch (err) {
                        showToast(err.message || 'Failed to delete address.', 'error');
                    } finally {
                        hideLoader();
                    }
                }
            });
        });

    } catch (err) {
        addressesContainer.innerHTML = `<p style="color: var(--danger);">Failed to load addresses.</p>`;
        console.error(err);
    }
}

// User details save
function setupDetailsUpdate() {
    detailsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameGroup = document.getElementById('name-group');
        nameGroup.classList.remove('has-error');

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();

        if (!name) {
            nameGroup.classList.add('has-error');
            return;
        }

        try {
            showLoader();
            const updatedUser = await api.put('/api/users/profile', {
                name,
                email,
                profileImageUrl: currentProfileImageUrl
            });
            showToast('Personal details updated successfully!', 'success');
            
            // Sync local storage display name
            localStorage.setItem('name', updatedUser.name);
            
            await loadProfileInfo();
        } catch (err) {
            showToast(err.message || 'Failed to update details.', 'error');
        } finally {
            hideLoader();
        }
    });
}

// Change Password logic + Strength Meter
function setupChangePasswordStrength() {
    newPasswordInput.addEventListener('input', () => {
        const val = newPasswordInput.value;
        if (!val) {
            newPassStrengthContainer.style.display = 'none';
            return;
        }
        newPassStrengthContainer.style.display = 'block';

        const criteria = {
            length: val.length >= 8,
            upper: /[A-Z]/.test(val),
            lower: /[a-z]/.test(val),
            number: /[0-9]/.test(val),
            special: /[^A-Za-z0-9]/.test(val)
        };

        const score = Object.values(criteria).filter(Boolean).length;

        let strength = 'Weak';
        let color = '#ef4444';
        let width = '33%';

        if (score === 5) {
            strength = 'Strong';
            color = '#10b981';
            width = '100%';
        } else if (score >= 3) {
            strength = 'Medium';
            color = '#f59e0b';
            width = '66%';
        }

        newPassStrengthFill.style.width = width;
        newPassStrengthFill.style.backgroundColor = color;
        newPassStrengthText.textContent = `Strength: ${strength}`;
        newPassStrengthText.style.color = color;
    });
}

function setupPasswordChange() {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const oldGroup = document.getElementById('old-pass-group');
        const newGroup = document.getElementById('new-pass-group');
        const confGroup = document.getElementById('confirm-pass-group');

        oldGroup.classList.remove('has-error');
        newGroup.classList.remove('has-error');
        confGroup.classList.remove('has-error');

        const oldPassword = oldPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        let isValid = true;
        if (!oldPassword) {
            oldGroup.classList.add('has-error');
            isValid = false;
        }
        if (!newPassword || newPassword.length < 8) {
            newGroup.classList.add('has-error');
            isValid = false;
        }
        if (newPassword !== confirmPassword) {
            confGroup.classList.add('has-error');
            isValid = false;
        }

        if (!isValid) return;

        try {
            showLoader();
            await api.post('/api/users/change-password', {
                oldPassword,
                newPassword,
                confirmPassword
            });
            showToast('Password changed successfully!', 'success');
            
            // Reset fields
            changePasswordForm.reset();
            newPassStrengthContainer.style.display = 'none';
        } catch (err) {
            showToast(err.message || 'Failed to change password.', 'error');
        } finally {
            hideLoader();
        }
    });
}

// Add Shipping Address
function setupAddressCreation() {
    addAddressForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const line1 = addressLine1.value.trim();
        const phone = addressPhone.value.trim();
        const city = addressCity.value.trim();
        const state = addressState.value.trim();
        const pincode = addressPincode.value.trim();

        try {
            showLoader();
            await api.post('/api/addresses', {
                line1,
                phone,
                city,
                state,
                pincode
            });
            showToast('Address added successfully!', 'success');
            addAddressForm.reset();
            await loadAddresses();
        } catch (err) {
            showToast(err.message || 'Failed to add address.', 'error');
        } finally {
            hideLoader();
        }
    });
}

// Avatar upload with ajax
function setupAvatarUpload() {
    avatarUploadInput.addEventListener('change', async () => {
        if (!avatarUploadInput.files || avatarUploadInput.files.length === 0) return;

        const file = avatarUploadInput.files[0];
        
        // Validate type & size client side
        if (file.size > 2 * 1024 * 1024) {
            showToast('File size is larger than 2MB.', 'error');
            avatarUploadInput.value = '';
            return;
        }
        
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'];
        if (!validTypes.includes(file.type)) {
            showToast('Invalid file format. Please upload JPEG, PNG, or GIF.', 'error');
            avatarUploadInput.value = '';
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            showLoader();
            
            // Custom fetch for multipart file upload
            const token = localStorage.getItem('token');
            const uploadResponse = await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!uploadResponse.ok) {
                const errData = await uploadResponse.json();
                throw new Error(errData?.message || 'Failed to upload photo.');
            }

            const data = await uploadResponse.json();
            const fileUrl = data.url; // relative path: e.g. "uploads/xyz.jpg"

            // Prepend API_BASE if needed, or save it relative. Since the Python server serves static contents,
            // the relative URL "uploads/xyz.jpg" is correct and readable at http://localhost:5500/uploads/xyz.jpg.
            currentProfileImageUrl = fileUrl;

            // Save to profile
            await api.put('/api/users/profile', {
                name: nameInput.value.trim(),
                email: emailInput.value.trim(),
                profileImageUrl: currentProfileImageUrl
            });

            showToast('Profile photo updated successfully!', 'success');
            await loadProfileInfo();

        } catch (err) {
            showToast(err.message || 'Failed to upload image.', 'error');
        } finally {
            avatarUploadInput.value = '';
            hideLoader();
        }
    });
}
