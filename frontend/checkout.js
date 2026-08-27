/* =========================================================
   PICKLE MART - AMAZON-STYLE CHECKOUT SYSTEM ENGINE (checkout.js)
   ========================================================= */

(function (window, document) {
    'use strict';

    const API_BASE_URL = 'http://localhost:5000/api';

    async function apiFetch(path, options = {}) {
        const primaryHost = 'http://localhost:5000/api';
        const fallbackHost = 'http://127.0.0.1:5000/api';
        const requestOptions = { ...options, cache: options.cache || 'no-store' };
        try {
            const res = await fetch(`${primaryHost}${path}`, requestOptions);
            return res;
        } catch (err1) {
            try {
                const res = await fetch(`${fallbackHost}${path}`, requestOptions);
                return res;
            } catch (err2) {
                throw err1;
            }
        }
    }

    const PickleMartCheckout = {
        items: [],
        fromCart: true,
        addresses: [],
        selectedAddressId: null,
        selectedDeliveryMethod: 'standard',
        selectedPaymentMethod: 'razorpay',
        currentStep: 1,
        promoDiscount: 0,

        deliveryMethods: {
            standard: {
                id: 'standard',
                title: 'Standard Delivery',
                badge: 'FREE over ₹499',
                baseFee: 40,
                days: 4,
                estimateText: function () { return getFutureDate(4); }
            },
            express: {
                id: 'express',
                title: 'Express Courier Delivery',
                badge: 'Fast 1-2 Days',
                baseFee: 99,
                days: 2,
                estimateText: function () { return getFutureDate(2); }
            },
            sameday: {
                id: 'sameday',
                title: 'Priority Same-Day / Next-Day',
                badge: 'Superfast',
                baseFee: 149,
                days: 1,
                estimateText: function () { return getFutureDate(1); }
            }
        },

        init: function () {
            this.injectRazorpaySDK();
            this.createModalDOM();
            this.bindEvents();
        },

        injectRazorpaySDK: function () {
            if (!document.getElementById('razorpay-sdk-script')) {
                const script = document.createElement('script');
                script.id = 'razorpay-sdk-script';
                script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                script.async = true;
                document.head.appendChild(script);
            }
        },

        createModalDOM: function () {
            if (document.getElementById('pmCheckoutOverlay')) return;
            if (!document.body) return;

            const modalHTML = `
                <div class="pm-checkout-overlay" id="pmCheckoutOverlay">
                    <div class="pm-checkout-modal">
                        <div class="pm-checkout-header">
                            <div class="pm-checkout-title">
                                <svg viewBox="0 0 24 24"><path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm7 17H5V8h14v12zm-7-8c-1.66 0-3-1.34-3-3H7c0 2.76 2.24 5 5 5s5-2.24 5-5h-2c0 1.66-1.34 3-3 3z"/></svg>
                                <span>Pickle Mart Checkout</span>
                            </div>
                            <button type="button" class="pm-close-btn" id="pmCloseModalBtn">&times;</button>
                        </div>

                        <div class="pm-checkout-stepper" id="pmCheckoutStepper">
                            <div class="pm-step-item active" data-step="1">
                                <div class="pm-step-number">1</div>
                                <span>Items & Summary</span>
                            </div>
                            <div class="pm-step-divider"></div>
                            <div class="pm-step-item" data-step="2">
                                <div class="pm-step-number">2</div>
                                <span>Delivery Address</span>
                            </div>
                            <div class="pm-step-divider"></div>
                            <div class="pm-step-item" data-step="3">
                                <div class="pm-step-number">3</div>
                                <span>Delivery Option</span>
                            </div>
                            <div class="pm-step-divider"></div>
                            <div class="pm-step-item" data-step="4">
                                <div class="pm-step-number">4</div>
                                <span>Payment Method</span>
                            </div>
                            <div class="pm-step-divider"></div>
                            <div class="pm-step-item" data-step="5">
                                <div class="pm-step-number">5</div>
                                <span>Review & Place Order</span>
                            </div>
                        </div>

                        <div class="pm-checkout-body">
                            <div class="pm-checkout-content" id="pmCheckoutContent">
                                <!-- Dynamic Step Views Inserted Here -->
                            </div>

                            <div class="pm-checkout-sidebar" id="pmCheckoutSidebar">
                                <div>
                                    <h4 class="pm-summary-title">Order Summary</h4>
                                    <div id="pmSidebarPriceBreakdown"></div>
                                </div>
                                <div>
                                    <button type="button" class="pm-place-order-btn" id="pmPrimaryActionBtn">
                                        <span>Proceed to Address</span> &rarr;
                                    </button>
                                    <div class="pm-secure-notice">
                                        🔒 256-Bit SSL Encrypted & Secured by Razorpay
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHTML);
        },

        bindEvents: function () {
            document.addEventListener('click', (e) => {
                if (e.target && e.target.id === 'pmCloseModalBtn') {
                    this.closeModal();
                }
                if (e.target && e.target.id === 'pmCheckoutOverlay') {
                    this.closeModal();
                }
            });

            const actionBtn = document.getElementById('pmPrimaryActionBtn');
            if (actionBtn) {
                actionBtn.addEventListener('click', () => this.handlePrimaryAction());
            }
        },

        // -------------------------------------------------------------
        // PUBLIC API: BUY NOW & CART CHECKOUT
        // -------------------------------------------------------------
        startBuyNow: async function (product) {
            const userId = localStorage.getItem('userId');
            if (!userId || userId.indexOf('guest_') === 0) {
                localStorage.setItem('pendingBuyNow', JSON.stringify(product || null));
                window.location.href = 'login.html';
                return;
            }

            return this.startDirectCheckout(product);
        },

        startDirectCheckout: async function (product) {
            let userId = localStorage.getItem('userId');
            if (!userId || userId.indexOf('guest_') === 0) {
                return this.startBuyNow(product);
            }

            if (!product) return;

            const productName = String(product.name || 'Pickle')
                .replace(/\s+pickle$/i, '')
                .trim() || 'Pickle';

            const item = {
                productId: product._id || product.id || '',
                name: productName,
                price: Number(product.price || product.basePrice || 0),
                qty: Number(product.qty || 1),
                weight: product.weight || '100g',
                image: product.image || 'Authentic.webp'
            };

            this.items = [item];
            this.fromCart = false;
            await this.openModal();
        },

        startCartCheckout: async function (itemsFromCartPage) {
            let userId = localStorage.getItem('userId');
            if (!userId) {
                alert('Please sign in to place your order.');
                window.location.href = 'login.html';
                return;
            }

            try {
                let items = Array.isArray(itemsFromCartPage) ? itemsFromCartPage : null;
                if (!items) {
                    const res = await apiFetch(`/cart/${encodeURIComponent(userId)}`);
                    if (!res || !res.ok) {
                        throw new Error('Unable to load your cart. Please refresh and try again.');
                    }
                    const cartData = await res.json();
                    items = Array.isArray(cartData.items) ? cartData.items : [];
                }

                if (!items || items.length === 0) {
                    alert('Your cart is currently empty. Please add items to your cart before checking out.');
                    return;
                }

                this.items = items.map(item => ({
                    productId: item.product?._id || item.product,
                    name: item.product?.name || item.name,
                    price: Number(item.price || item.product?.basePrice || 0),
                    qty: Number(item.qty || 1),
                    weight: item.weight || '100g',
                    image: item.product?.image || 'Authentic.webp'
                }));

                this.fromCart = true;
                await this.openModal();
            } catch (err) {
                console.error('Error in startCartCheckout:', err);
                alert(err.message || 'Unable to open checkout. Please refresh and try again.');
            }
        },

        openModal: async function () {
            if (!document.getElementById('pmCheckoutOverlay')) {
                this.init();
            }

            // Restore stepper and sidebar display if previously hidden by confirmation screen
            const stepper = document.getElementById('pmCheckoutStepper');
            const sidebar = document.getElementById('pmCheckoutSidebar');
            const content = document.getElementById('pmCheckoutContent');
            if (stepper) stepper.style.display = 'flex';
            if (sidebar) sidebar.style.display = 'flex';
            if (content && content.parentElement) content.parentElement.style.padding = '';

            const actionBtn = document.getElementById('pmPrimaryActionBtn');
            if (actionBtn) {
                actionBtn.disabled = false;
            }

            this.currentStep = 1;
            try {
                await this.loadUserAddresses();
            } catch (err) {
                console.log('Address load fallback:', err);
            }

            this.renderCurrentStep();
            this.updateSidebarSummary();

            const overlay = document.getElementById('pmCheckoutOverlay');
            if (overlay) overlay.classList.add('active');
        },

        closeModal: function () {
            const overlay = document.getElementById('pmCheckoutOverlay');
            if (overlay) overlay.classList.remove('active');
        },

        // -------------------------------------------------------------
        // DATA FETCHING & ADDRESS MANAGEMENT
        // -------------------------------------------------------------
        loadUserAddresses: async function () {
            const userId = localStorage.getItem('userId');
            if (!userId) return;

            try {
                const res = await apiFetch(`/auth/user/${userId}`);
                if (res && res.ok) {
                    const userData = await res.json();
                    this.addresses = userData.addresses || [];

                    const defaultAddr = this.addresses.find(a => a.isDefault);
                    if (defaultAddr) {
                        this.selectedAddressId = defaultAddr._id;
                    } else if (this.addresses.length > 0) {
                        this.selectedAddressId = this.addresses[0]._id;
                    }
                }
            } catch (err) {
                console.warn('Error loading user addresses:', err.message);
                if (!this.addresses) this.addresses = [];
            }
        },

        // -------------------------------------------------------------
        // STEPPER CONTROL & RENDERING
        // -------------------------------------------------------------
        goToStep: function (stepNumber) {
            if (stepNumber < 1 || stepNumber > 5) return;
            this.currentStep = stepNumber;
            this.renderCurrentStep();
            this.updateSidebarSummary();
        },

        updateStepperHeader: function () {
            const items = document.querySelectorAll('.pm-step-item');
            const dividers = document.querySelectorAll('.pm-step-divider');

            items.forEach((item, index) => {
                const step = index + 1;
                item.classList.remove('active', 'completed');
                if (step === this.currentStep) {
                    item.classList.add('active');
                } else if (step < this.currentStep) {
                    item.classList.add('completed');
                }
            });

            dividers.forEach((div, index) => {
                div.classList.toggle('active', index + 1 < this.currentStep);
            });
        },

        renderCurrentStep: function () {
            this.updateStepperHeader();
            const container = document.getElementById('pmCheckoutContent');
            if (!container) return;

            switch (this.currentStep) {
                case 1:
                    container.innerHTML = this.renderStep1Items();
                    break;
                case 2:
                    container.innerHTML = this.renderStep2Addresses();
                    break;
                case 3:
                    container.innerHTML = this.renderStep3DeliveryOptions();
                    break;
                case 4:
                    container.innerHTML = this.renderStep4PaymentMethods();
                    break;
                case 5:
                    container.innerHTML = this.renderStep5OrderReview();
                    break;
            }

            this.bindStepContentEvents();
        },

        // The step views use inline handlers for their dynamic controls. Keep
        // this hook available so every rendered step can be refreshed safely.
        bindStepContentEvents: function () {
            const container = document.getElementById('pmCheckoutContent');
            if (!container) return;
        },

        // -------------------------------------------------------------
        // STEP 1: PRODUCTS & QUANTITY ADJUSTMENT
        // -------------------------------------------------------------
        renderStep1Items: function () {
            const itemsHtml = this.items.map((item, index) => `
                <div class="pm-product-row">
                    <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="pm-product-img" onerror="this.src='Authentic.webp'">
                    <div class="pm-product-details">
                        <h4 class="pm-product-name">${escapeHtml(item.name)} Pickle</h4>
                        <div class="pm-product-meta">Weight: ${escapeHtml(item.weight)} | Unit Price: ₹${item.price.toFixed(2)}</div>
                        <div class="pm-qty-control">
                            <button type="button" class="pm-qty-btn" onclick="PickleMartCheckout.updateItemQty(${index}, -1)">-</button>
                            <span class="pm-qty-val">${item.qty}</span>
                            <button type="button" class="pm-qty-btn" onclick="PickleMartCheckout.updateItemQty(${index}, 1)">+</button>
                        </div>
                    </div>
                    <div class="pm-product-price">₹${(item.price * item.qty).toFixed(2)}</div>
                </div>
            `).join('');

            return `
                <div class="pm-section-card">
                    <div class="pm-section-header">
                        <h3>🛒 Step 1: Selected Products & Order Items</h3>
                        <span style="font-size: 13px; color: #777;">${this.items.length} Product(s)</span>
                    </div>
                    ${itemsHtml}
                </div>
            `;
        },

        updateItemQty: function (index, delta) {
            if (this.items[index]) {
                const newQty = this.items[index].qty + delta;
                if (newQty <= 0) {
                    if (confirm(`Remove ${this.items[index].name} from order?`)) {
                        this.items.splice(index, 1);
                    }
                } else {
                    this.items[index].qty = newQty;
                }
                if (this.items.length === 0) {
                    alert('No items left in checkout.');
                    this.closeModal();
                    return;
                }
                this.renderCurrentStep();
                this.updateSidebarSummary();
            }
        },

        // -------------------------------------------------------------
        // STEP 2: SAVED ADDRESSES & NEW ADDRESS FORM
        // -------------------------------------------------------------
        renderStep2Addresses: function () {
            const addressCards = this.addresses.map(addr => {
                const isSelected = String(addr._id) === String(this.selectedAddressId);
                return `
                    <div class="pm-address-card ${isSelected ? 'selected' : ''}" onclick="PickleMartCheckout.selectAddress('${addr._id}')">
                        <input type="radio" name="pmAddressRadio" class="pm-address-radio" ${isSelected ? 'checked' : ''}>
                        <div class="pm-address-name">
                            ${escapeHtml(addr.name)}
                            ${addr.isDefault ? '<span class="pm-badge-default">DEFAULT</span>' : ''}
                        </div>
                        <div class="pm-address-text">
                            ${escapeHtml(addr.houseNo ? addr.houseNo + ', ' : '')}${escapeHtml(addr.street ? addr.street + ', ' : '')}
                            ${escapeHtml(addr.area ? addr.area + ', ' : '')}${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} - ${escapeHtml(addr.pincode)}
                            ${addr.landmark ? '<br><small>Landmark: ' + escapeHtml(addr.landmark) + '</small>' : ''}
                        </div>
                        <div class="pm-address-phone">📱 Mobile: ${escapeHtml(addr.mobile)}</div>
                        <div class="pm-address-actions">
                            ${!addr.isDefault ? `<button type="button" class="pm-action-link" onclick="event.stopPropagation(); PickleMartCheckout.setDefaultAddress('${addr._id}')">Set as Default</button> |` : ''}
                            <button type="button" class="pm-action-link" onclick="event.stopPropagation(); PickleMartCheckout.openEditAddressForm('${addr._id}')">Edit</button> |
                            <button type="button" class="pm-action-link" onclick="event.stopPropagation(); PickleMartCheckout.deleteAddress('${addr._id}')">Delete</button>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="pm-section-card">
                    <div class="pm-section-header">
                        <h3>📍 Step 2: Select Delivery Address</h3>
                    </div>
                    ${this.addresses.length > 0 ? `<div class="pm-address-grid">${addressCards}</div>` : '<p style="color:#777;">No saved addresses found. Please add a delivery address below.</p>'}
                    <button type="button" class="pm-add-address-btn" id="pmAddAddrToggleBtn" onclick="PickleMartCheckout.toggleNewAddressForm()">
                        ➕ Add a New Address
                    </button>

                    <div class="pm-address-form-box" id="pmNewAddressFormBox" style="display: none;">
                        <h4 style="margin-top: 0; font-size: 16px; color: #241f20;" id="pmAddrFormTitle">Add New Delivery Address</h4>
                        <input type="hidden" id="pmFormAddressId" value="">
                        <div class="pm-form-grid">
                            <div class="pm-form-group">
                                <label>Full Name *</label>
                                <input type="text" id="pmFormName" placeholder="e.g. Vinay Murali">
                            </div>
                            <div class="pm-form-group">
                                <label>10-Digit Mobile Number *</label>
                                <input type="tel" id="pmFormMobile" placeholder="e.g. 9876543210">
                            </div>
                            <div class="pm-form-group">
                                <label>Flat, House No., Building *</label>
                                <input type="text" id="pmFormHouseNo" placeholder="Flat No. 302, Green Towers">
                            </div>
                            <div class="pm-form-group">
                                <label>Street / Road *</label>
                                <input type="text" id="pmFormStreet" placeholder="MG Road / Main Street">
                            </div>
                            <div class="pm-form-group">
                                <label>Area / Locality *</label>
                                <input type="text" id="pmFormArea" placeholder="Indiranagar">
                            </div>
                            <div class="pm-form-group">
                                <label>City *</label>
                                <input type="text" id="pmFormCity" placeholder="Bengaluru">
                            </div>
                            <div class="pm-form-group">
                                <label>State *</label>
                                <input type="text" id="pmFormState" placeholder="Karnataka">
                            </div>
                            <div class="pm-form-group">
                                <label>PIN Code *</label>
                                <input type="text" id="pmFormPincode" placeholder="560038">
                            </div>
                            <div class="pm-form-group pm-form-full">
                                <label>Landmark (Optional)</label>
                                <input type="text" id="pmFormLandmark" placeholder="Near City Park / Metro Station">
                            </div>
                            <div class="pm-form-group pm-form-full pm-form-checkbox">
                                <input type="checkbox" id="pmFormIsDefault" checked>
                                <label for="pmFormIsDefault" style="margin:0; cursor:pointer;">Make this my default delivery address</label>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 14px;">
                            <button type="button" class="pm-place-order-btn" style="margin:0; flex:1;" onclick="PickleMartCheckout.saveAddressForm()">Save Address</button>
                            <button type="button" class="pm-btn-secondary" onclick="PickleMartCheckout.toggleNewAddressForm(false)">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        },

        selectAddress: function (addressId) {
            this.selectedAddressId = addressId;
            this.renderCurrentStep();
            this.updateSidebarSummary();
        },

        toggleNewAddressForm: function (show) {
            const formBox = document.getElementById('pmNewAddressFormBox');
            if (!formBox) return;
            const currentDisplay = formBox.style.display;
            const targetDisplay = show !== undefined ? (show ? 'block' : 'none') : (currentDisplay === 'none' ? 'block' : 'none');
            formBox.style.display = targetDisplay;

            if (targetDisplay === 'block' && show !== false) {
                document.getElementById('pmFormAddressId').value = '';
                document.getElementById('pmAddrFormTitle').textContent = 'Add New Delivery Address';
                document.getElementById('pmFormName').value = localStorage.getItem('username') || '';
                document.getElementById('pmFormMobile').value = '';
                document.getElementById('pmFormHouseNo').value = '';
                document.getElementById('pmFormStreet').value = '';
                document.getElementById('pmFormArea').value = '';
                document.getElementById('pmFormCity').value = '';
                document.getElementById('pmFormState').value = '';
                document.getElementById('pmFormPincode').value = '';
                document.getElementById('pmFormLandmark').value = '';
            }
        },

        openEditAddressForm: function (addressId) {
            const addr = this.addresses.find(a => String(a._id) === String(addressId));
            if (!addr) return;
            this.toggleNewAddressForm(true);
            document.getElementById('pmAddrFormTitle').textContent = 'Edit Delivery Address';
            document.getElementById('pmFormAddressId').value = addr._id;
            document.getElementById('pmFormName').value = addr.name || '';
            document.getElementById('pmFormMobile').value = addr.mobile || '';
            document.getElementById('pmFormHouseNo').value = addr.houseNo || '';
            document.getElementById('pmFormStreet').value = addr.street || '';
            document.getElementById('pmFormArea').value = addr.area || '';
            document.getElementById('pmFormCity').value = addr.city || '';
            document.getElementById('pmFormState').value = addr.state || '';
            document.getElementById('pmFormPincode').value = addr.pincode || '';
            document.getElementById('pmFormLandmark').value = addr.landmark || '';
            document.getElementById('pmFormIsDefault').checked = !!addr.isDefault;
        },

        saveAddressForm: async function () {
            const userId = localStorage.getItem('userId');
            const addressId = document.getElementById('pmFormAddressId').value;
            const payload = {
                userId,
                name: document.getElementById('pmFormName').value.trim(),
                mobile: document.getElementById('pmFormMobile').value.trim(),
                houseNo: document.getElementById('pmFormHouseNo').value.trim(),
                street: document.getElementById('pmFormStreet').value.trim(),
                area: document.getElementById('pmFormArea').value.trim(),
                city: document.getElementById('pmFormCity').value.trim(),
                state: document.getElementById('pmFormState').value.trim(),
                pincode: document.getElementById('pmFormPincode').value.trim(),
                landmark: document.getElementById('pmFormLandmark').value.trim(),
                isDefault: document.getElementById('pmFormIsDefault').checked
            };

            if (!payload.name || !payload.mobile || !payload.houseNo || !payload.city || !payload.pincode) {
                alert('Please fill in all required address fields (*).');
                return;
            }

            try {
                const path = addressId ? `/auth/addresses/${addressId}` : `/auth/addresses`;
                const method = addressId ? 'PUT' : 'POST';

                const res = await apiFetch(path, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Failed to save address');

                this.addresses = data.addresses || [];
                if (data.addedAddress) {
                    this.selectedAddressId = data.addedAddress._id;
                } else if (addressId) {
                    this.selectedAddressId = addressId;
                }
                this.renderCurrentStep();
                this.updateSidebarSummary();
            } catch (err) {
                alert(err.message);
            }
        },

        setDefaultAddress: async function (addressId) {
            const userId = localStorage.getItem('userId');
            try {
                const res = await apiFetch(`/auth/addresses/${addressId}/default`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                });
                if (res && res.ok) {
                    const data = await res.json();
                    this.addresses = data.addresses;
                    this.selectedAddressId = addressId;
                    this.renderCurrentStep();
                    this.updateSidebarSummary();
                }
            } catch (err) {
                console.error(err);
            }
        },

        deleteAddress: async function (addressId) {
            const userId = localStorage.getItem('userId');
            if (!confirm('Are you sure you want to delete this address?')) return;
            try {
                const res = await apiFetch(`/auth/addresses/${addressId}?userId=${userId}`, {
                    method: 'DELETE'
                });
                if (res && res.ok) {
                    const data = await res.json();
                    this.addresses = data.addresses;
                    if (String(this.selectedAddressId) === String(addressId)) {
                        this.selectedAddressId = this.addresses.length > 0 ? this.addresses[0]._id : null;
                    }
                    this.renderCurrentStep();
                    this.updateSidebarSummary();
                }
            } catch (err) {
                console.error(err);
            }
        },

        // -------------------------------------------------------------
        // STEP 3: DELIVERY OPTIONS
        // -------------------------------------------------------------
        renderStep3DeliveryOptions: function () {
            const subtotal = this.calculateSubtotal();
            const optionCards = Object.values(this.deliveryMethods).map(opt => {
                const isSelected = opt.id === this.selectedDeliveryMethod;
                const fee = (opt.id === 'standard' && subtotal >= 499) ? 0 : opt.baseFee;
                const feeText = fee === 0 ? '<span style="color:#2e7d32;">FREE</span>' : `₹${fee.toFixed(2)}`;

                return `
                    <div class="pm-option-card ${isSelected ? 'selected' : ''}" onclick="PickleMartCheckout.selectDeliveryOption('${opt.id}')">
                        <input type="radio" name="pmDeliveryRadio" class="pm-option-radio" ${isSelected ? 'checked' : ''}>
                        <div class="pm-option-info">
                            <div class="pm-option-title">
                                ${escapeHtml(opt.title)}
                                <span class="pm-badge-default" style="background:#241f20;">${opt.badge}</span>
                            </div>
                            <div class="pm-option-date">🚚 Estimated Arrival: ${opt.estimateText()}</div>
                        </div>
                        <div class="pm-option-fee">${feeText}</div>
                    </div>
                `;
            }).join('');

            return `
                <div class="pm-section-card">
                    <div class="pm-section-header">
                        <h3>🚚 Step 3: Choose Delivery Speed & Method</h3>
                    </div>
                    <div class="pm-delivery-options">
                        ${optionCards}
                    </div>
                </div>
            `;
        },

        selectDeliveryOption: function (optionId) {
            this.selectedDeliveryMethod = optionId;
            this.renderCurrentStep();
            this.updateSidebarSummary();
        },

        // -------------------------------------------------------------
        // STEP 4: PAYMENT METHODS
        // -------------------------------------------------------------
        renderStep4PaymentMethods: function () {
            const methods = [
                { id: 'razorpay', label: '💳 Razorpay Online' },
                { id: 'upi', label: '📱 UPI (GPay/PhonePe)' },
                { id: 'card', label: '💳 Credit/Debit Card' },
                { id: 'netbanking', label: '🏦 Net Banking' },
                { id: 'wallet', label: '👛 Wallets' },
                { id: 'cod', label: '💵 Cash on Delivery' }
            ];

            const tabsHtml = methods.map(m => `
                <div class="pm-pay-tab ${m.id === this.selectedPaymentMethod ? 'selected' : ''}" onclick="PickleMartCheckout.selectPaymentMethod('${m.id}')">
                    ${m.label}
                </div>
            `).join('');

            return `
                <div class="pm-section-card">
                    <div class="pm-section-header">
                        <h3>💳 Step 4: Select Payment Method</h3>
                    </div>
                    <div class="pm-payment-tabs">
                        ${tabsHtml}
                    </div>

                    <div class="pm-pay-panel ${this.selectedPaymentMethod === 'razorpay' ? 'active' : ''}">
                        <div class="pm-gateway-badge">
                            ⚡ Powered by Official Razorpay Payment Gateway (Supports UPI, Cards, NetBanking, QR & Wallets)
                        </div>
                        <p style="font-size: 13px; color: #555; margin: 0;">
                            When you click <strong>"Pay & Place Order"</strong>, the secure Razorpay payment modal will open. Upon authorization, your order status will be instantly verified and saved to MongoDB.
                        </p>
                    </div>

                    <div class="pm-pay-panel ${this.selectedPaymentMethod === 'upi' ? 'active' : ''}">
                        <div class="pm-form-group">
                            <label>Enter Virtual Payment Address (VPA / UPI ID)</label>
                            <input type="text" id="pmUpiIdInput" placeholder="username@upi or 9876543210@paytm" value="customer@upi">
                            <small style="color:#777; margin-top:4px;">Supports Google Pay, PhonePe, Paytm, BHIM, and Cred UPI.</small>
                        </div>
                    </div>

                    <div class="pm-pay-panel ${this.selectedPaymentMethod === 'card' ? 'active' : ''}">
                        <div class="pm-form-grid">
                            <div class="pm-form-group pm-form-full">
                                <label>Card Number</label>
                                <input type="text" placeholder="4532 •••• •••• 8921" maxlength="19">
                            </div>
                            <div class="pm-form-group">
                                <label>Expiry Date</label>
                                <input type="text" placeholder="MM / YY">
                            </div>
                            <div class="pm-form-group">
                                <label>CVV</label>
                                <input type="password" placeholder="•••" maxlength="4">
                            </div>
                        </div>
                        <small style="color:#777; margin-top:6px; display:block;">🔒 Raw card credentials are processed directly via secure gateway tokenization and are NEVER stored on our database.</small>
                    </div>

                    <div class="pm-pay-panel ${this.selectedPaymentMethod === 'netbanking' ? 'active' : ''}">
                        <div class="pm-form-group">
                            <label>Select Bank</label>
                            <select>
                                <option>HDFC Bank</option>
                                <option>ICICI Bank</option>
                                <option>State Bank of India (SBI)</option>
                                <option>Axis Bank</option>
                                <option>Kotak Mahindra Bank</option>
                            </select>
                        </div>
                    </div>

                    <div class="pm-pay-panel ${this.selectedPaymentMethod === 'wallet' ? 'active' : ''}">
                        <div class="pm-form-group">
                            <label>Select Wallet</label>
                            <select>
                                <option>Paytm Wallet</option>
                                <option>PhonePe Wallet</option>
                                <option>MobiKwik</option>
                                <option>Amazon Pay</option>
                            </select>
                        </div>
                    </div>

                    <div class="pm-pay-panel ${this.selectedPaymentMethod === 'cod' ? 'active' : ''}">
                        <div style="background:#fff9df; border:1px solid #e0d6cf; padding:12px; border-radius:8px; font-size:13px; color:#555;">
                            💵 <strong>Cash on Delivery (COD) Enabled</strong><br>
                            Pay with exact cash or UPI QR upon delivery. No upfront payment required.
                        </div>
                    </div>
                </div>
            `;
        },

        selectPaymentMethod: function (methodId) {
            this.selectedPaymentMethod = methodId;
            this.renderCurrentStep();
            this.updateSidebarSummary();
        },

        // -------------------------------------------------------------
        // STEP 5: FINAL ORDER REVIEW & EDITABLE ACCORDIONS
        // -------------------------------------------------------------
        renderStep5OrderReview: function () {
            const addr = this.addresses.find(a => String(a._id) === String(this.selectedAddressId));
            const deliveryOpt = this.deliveryMethods[this.selectedDeliveryMethod];

            const addrText = addr
                ? `<strong>${escapeHtml(addr.name)}</strong> (${escapeHtml(addr.mobile)})<br>${escapeHtml(addr.houseNo ? addr.houseNo + ', ' : '')}${escapeHtml(addr.area)}, ${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} - ${escapeHtml(addr.pincode)}`
                : '<span style="color:red;">No address selected</span>';

            const itemsReviewHtml = this.items.map(item => `
                <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px dashed #eee;">
                    <span>${escapeHtml(item.name)} (${escapeHtml(item.weight)}) &times; ${item.qty}</span>
                    <strong style="color:#241f20;">₹${(item.price * item.qty).toFixed(2)}</strong>
                </div>
            `).join('');

            return `
                <div class="pm-section-card">
                    <div class="pm-section-header">
                        <h3>📋 Step 5: Final Order Review</h3>
                    </div>

                    <!-- Products Review -->
                    <div style="background:#faf7f4; padding:14px; border-radius:8px; margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <strong style="font-size:14px;">📦 Ordered Items (${this.items.length})</strong>
                            <button type="button" class="pm-edit-btn" onclick="PickleMartCheckout.goToStep(1)">Edit Items</button>
                        </div>
                        ${itemsReviewHtml}
                    </div>

                    <!-- Address Review -->
                    <div style="background:#faf7f4; padding:14px; border-radius:8px; margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <strong style="font-size:14px;">📍 Delivery Address</strong>
                            <button type="button" class="pm-edit-btn" onclick="PickleMartCheckout.goToStep(2)">Edit Address</button>
                        </div>
                        <div style="font-size:13px; color:#444; line-height:1.5;">${addrText}</div>
                    </div>

                    <!-- Delivery & Payment Review -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div style="background:#faf7f4; padding:14px; border-radius:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <strong style="font-size:14px;">🚚 Delivery Option</strong>
                                <button type="button" class="pm-edit-btn" onclick="PickleMartCheckout.goToStep(3)">Edit</button>
                            </div>
                            <div style="font-size:13px; color:#444;">
                                <strong>${deliveryOpt.title}</strong><br>
                                <span style="color:#2e7d32;">Est: ${deliveryOpt.estimateText()}</span>
                            </div>
                        </div>

                        <div style="background:#faf7f4; padding:14px; border-radius:8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <strong style="font-size:14px;">💳 Payment Method</strong>
                                <button type="button" class="pm-edit-btn" onclick="PickleMartCheckout.goToStep(4)">Edit</button>
                            </div>
                            <div style="font-size:13px; color:#444;">
                                <strong>${this.selectedPaymentMethod.toUpperCase()}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        // -------------------------------------------------------------
        // SIDEBAR SUMMARY & PRICE CALCULATIONS
        // -------------------------------------------------------------
        calculateSubtotal: function () {
            return this.items.reduce((acc, item) => acc + (item.price * item.qty), 0);
        },

        calculateDeliveryFee: function () {
            const subtotal = this.calculateSubtotal();
            const opt = this.deliveryMethods[this.selectedDeliveryMethod];
            if (opt.id === 'standard' && subtotal >= 499) return 0;
            return opt ? opt.baseFee : 0;
        },

        calculateTax: function () {
            const subtotal = this.calculateSubtotal();
            return Math.round(subtotal * 0.05 * 100) / 100; // 5% GST
        },

        calculateTotal: function () {
            const subtotal = this.calculateSubtotal();
            const fee = this.calculateDeliveryFee();
            const tax = this.calculateTax();
            return Math.max(0, subtotal - this.promoDiscount + fee + tax);
        },

        updateSidebarSummary: function () {
            const container = document.getElementById('pmSidebarPriceBreakdown');
            const actionBtn = document.getElementById('pmPrimaryActionBtn');
            if (!container || !actionBtn) return;

            const subtotal = this.calculateSubtotal();
            const fee = this.calculateDeliveryFee();
            const tax = this.calculateTax();
            const total = this.calculateTotal();

            container.innerHTML = `
                <div class="pm-price-row">
                    <span>Items Subtotal:</span>
                    <span>₹${subtotal.toFixed(2)}</span>
                </div>
                ${this.promoDiscount > 0 ? `<div class="pm-price-row discount"><span>Discount:</span><span>-₹${this.promoDiscount.toFixed(2)}</span></div>` : ''}
                <div class="pm-price-row">
                    <span>Delivery Charge:</span>
                    <span>${fee === 0 ? '<span style="color:#2e7d32;">FREE</span>' : '₹' + fee.toFixed(2)}</span>
                </div>
                <div class="pm-price-row">
                    <span>GST (5% Tax):</span>
                    <span>₹${tax.toFixed(2)}</span>
                </div>
                <div class="pm-price-row total">
                    <span>Order Total:</span>
                    <span class="pm-price-total-val">₹${total.toFixed(2)}</span>
                </div>
            `;

            // Update button text depending on current step
            if (this.currentStep < 5) {
                actionBtn.innerHTML = `<span>Continue to Step ${this.currentStep + 1}</span> &rarr;`;
            } else {
                actionBtn.innerHTML = `🔒 Pay & Place Order (₹${total.toFixed(2)})`;
            }
        },

        // -------------------------------------------------------------
        // ORDER PLACEMENT & RAZORPAY INTEGRATION
        // -------------------------------------------------------------
        handlePrimaryAction: function () {
            if (this.currentStep === 1) {
                this.goToStep(2);
            } else if (this.currentStep === 2) {
                if (!this.selectedAddressId) {
                    alert('Please select or add a delivery address to proceed.');
                    return;
                }
                this.goToStep(3);
            } else if (this.currentStep === 3) {
                this.goToStep(4);
            } else if (this.currentStep === 4) {
                this.goToStep(5);
            } else if (this.currentStep === 5) {
                this.executePlaceOrder();
            }
        },

        executePlaceOrder: async function () {
            const userId = localStorage.getItem('userId');
            const selectedAddress = this.addresses.find(a => String(a._id) === String(this.selectedAddressId));

            if (!userId) {
                alert('Session expired. Please sign in again.');
                window.location.href = 'login.html';
                return;
            }

            if (!selectedAddress) {
                alert('Delivery address missing. Please go back to step 2.');
                return;
            }

            const actionBtn = document.getElementById('pmPrimaryActionBtn');
            if (actionBtn) {
                actionBtn.disabled = true;
                actionBtn.innerHTML = '⌛ Securing Payment...';
            }

            const total = this.calculateTotal();
            const subtotal = this.calculateSubtotal();
            const deliveryFee = this.calculateDeliveryFee();
            const tax = this.calculateTax();
            const opt = this.deliveryMethods[this.selectedDeliveryMethod];

            // 1. ONLINE PAYMENT METHOD (Razorpay / UPI / Card / NetBanking / Wallet)
            if (this.selectedPaymentMethod !== 'cod') {
                try {
                    const res = await apiFetch(`/orders/create-razorpay-order`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: total })
                    });
                    const rzpOrderData = await res.json();

                    if (!res.ok) throw new Error(rzpOrderData.message || 'Failed to create payment order');

                    // If live Razorpay script & keys present, launch official Razorpay popup modal
                    if (window.Razorpay && rzpOrderData.keyId && !rzpOrderData.isMock) {
                        const options = {
                            key: rzpOrderData.keyId,
                            amount: rzpOrderData.amount,
                            currency: rzpOrderData.currency,
                            name: 'Pickle Mart',
                            description: 'Pickle Order Payment',
                            image: 'logo.png',
                            order_id: rzpOrderData.razorpayOrderId,
                            handler: async (response) => {
                                await PickleMartCheckout.verifyPaymentAndSave({
                                    razorpay_order_id: response.razorpay_order_id,
                                    razorpay_payment_id: response.razorpay_payment_id,
                                    razorpay_signature: response.razorpay_signature,
                                    isMock: false
                                });
                            },
                            prefill: {
                                name: selectedAddress ? selectedAddress.name : '',
                                contact: selectedAddress ? selectedAddress.mobile : ''
                            },
                            theme: { color: '#ed1c24' }
                        };
                        const rzpInstance = new window.Razorpay(options);
                        rzpInstance.open();
                        rzpInstance.on('payment.failed', function (resp) {
                            alert(`Payment Failed: ${resp.error.description}`);
                            if (actionBtn) {
                                actionBtn.disabled = false;
                                actionBtn.innerHTML = `🔒 Pay & Place Order (₹${total.toFixed(2)})`;
                            }
                        });
                    } else {
                        // Fallback Sandbox / Simulated Payment Verification
                        await this.verifyPaymentAndSave({
                            razorpay_order_id: rzpOrderData.razorpayOrderId || `order_sim_${Date.now()}`,
                            razorpay_payment_id: `pay_sim_${Date.now()}`,
                            razorpay_signature: 'simulated_signature_ok',
                            isMock: true
                        });
                    }
                } catch (err) {
                    alert(`Payment setup error: ${err.message}`);
                    if (actionBtn) {
                        actionBtn.disabled = false;
                        actionBtn.innerHTML = `🔒 Pay & Place Order (₹${total.toFixed(2)})`;
                    }
                }
            } else {
                // 2. CASH ON DELIVERY (COD) ORDER PLACEMENT
                try {
                    const res = await apiFetch(`/orders/checkout`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            items: this.items,
                            deliveryAddress: selectedAddress || {},
                            deliveryMethod: opt.title,
                            deliveryEstimate: opt.estimateText(),
                            paymentMethod: 'cod',
                            discount: this.promoDiscount,
                            deliveryFee,
                            fromCart: this.fromCart
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'COD Order checkout failed.');

                    this.renderConfirmationScreen(data.order);
                } catch (err) {
                    alert(err.message);
                    if (actionBtn) {
                        actionBtn.disabled = false;
                        actionBtn.innerHTML = `🔒 Pay & Place Order (₹${total.toFixed(2)})`;
                    }
                }
            }
        },

        verifyPaymentAndSave: async function (paymentData) {
            const userId = localStorage.getItem('userId');
            const selectedAddress = this.addresses.find(a => String(a._id) === String(this.selectedAddressId));
            const opt = this.deliveryMethods[this.selectedDeliveryMethod];

            try {
                const res = await apiFetch(`/orders/verify-payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...paymentData,
                        userId,
                        items: this.items,
                        deliveryAddress: selectedAddress || {},
                        deliveryMethod: opt.title,
                        deliveryEstimate: opt.estimateText(),
                        paymentMethod: this.selectedPaymentMethod,
                        subtotal: this.calculateSubtotal(),
                        discount: this.promoDiscount,
                        deliveryFee: this.calculateDeliveryFee(),
                        tax: this.calculateTax(),
                        totalAmount: this.calculateTotal(),
                        fromCart: this.fromCart
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.message || 'Payment verification failed.');
                }

                this.renderConfirmationScreen(data.order);
            } catch (err) {
                alert(`Payment verification error: ${err.message}`);
                const actionBtn = document.getElementById('pmPrimaryActionBtn');
                if (actionBtn) {
                    actionBtn.disabled = false;
                    actionBtn.innerHTML = `🔒 Pay & Place Order (₹${this.calculateTotal().toFixed(2)})`;
                }
            }
        },

        // -------------------------------------------------------------
        // ORDER CONFIRMATION VIEW
        // -------------------------------------------------------------
        renderConfirmationScreen: function (order) {
            const stepper = document.getElementById('pmCheckoutStepper');
            const sidebar = document.getElementById('pmCheckoutSidebar');
            const content = document.getElementById('pmCheckoutContent');

            if (stepper) stepper.style.display = 'none';
            if (sidebar) sidebar.style.display = 'none';

            const formattedDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            content.parentElement.style.padding = '0';
            content.innerHTML = `
                <div class="pm-confirm-view">
                    <div class="pm-confirm-icon">✓</div>
                    <h2 class="pm-confirm-h2">Order Placed Successfully!</h2>
                    <p class="pm-confirm-subtitle">Thank you for choosing Pickle Mart. Your order details have been stored in MongoDB database.</p>

                    <div class="pm-order-badge-box">
                        <div><strong>Order ID:</strong> ${order._id}</div>
                        <div><strong>Payment Method:</strong> ${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'ONLINE'} | <strong>Status:</strong> <span style="color:#2e7d32;">${order.paymentStatus || 'Paid'}</span></div>
                        <div><strong>Estimated Delivery:</strong> ${order.deliveryEstimate || '3-5 Business Days'}</div>
                        <div><strong>Date Placed:</strong> ${formattedDate}</div>
                    </div>

                    <div style="max-width:500px; margin:0 auto; text-align:left; background:#faf7f4; padding:16px; border-radius:10px;">
                        <h4 style="margin-top:0; font-size:15px; color:#241f20; border-bottom:1px solid #ddd; padding-bottom:8px;">Purchased Items</h4>
                        ${(order.items || []).map(i => `
                            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px;">
                                <span>${escapeHtml(i.name)} &times; ${i.qty}</span>
                                <strong>₹${(i.total || (i.unitPrice * i.qty)).toFixed(2)}</strong>
                            </div>
                        `).join('')}
                        <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:800; border-top:2px solid #241f20; padding-top:8px; margin-top:8px;">
                            <span>Total Amount Paid:</span>
                            <span style="color:#ed1c24;">₹${(order.totalAmount || order.subtotal).toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="pm-confirm-actions">
                        <a href="profile.html" class="pm-btn-secondary">View My Orders</a>
                        <button type="button" class="pm-place-order-btn" style="margin:0; width:auto; padding:12px 28px;" onclick="PickleMartCheckout.closeModal(); window.location.href='veg.html';">
                            Continue Shopping
                        </button>
                    </div>
                </div>
            `;
        },

        // -------------------------------------------------------------
        // UTILITY: STATUS STEPPER TIMELINE FOR PROFILE/CART VIEWS
        // -------------------------------------------------------------
        renderStatusStepperHTML: function (currentStatus) {
            const steps = [
                'Order Placed',
                'Payment Confirmed',
                'Processing',
                'Shipped',
                'Out for Delivery',
                'Delivered'
            ];

            const curLower = String(currentStatus || 'Order Placed').toLowerCase();
            let activeIdx = 0;
            if (curLower.includes('cancel')) activeIdx = -1;
            else if (curLower.includes('confirm') || curLower === 'packed') activeIdx = 1;
            else if (curLower.includes('process')) activeIdx = 2;
            else if (curLower.includes('ship')) activeIdx = 3;
            else if (curLower.includes('out')) activeIdx = 4;
            else if (curLower.includes('deliver')) activeIdx = 5;

            const progressPct = activeIdx < 0 ? 0 : (activeIdx / (steps.length - 1)) * 100;

            const stepsHtml = steps.map((s, idx) => {
                const isReached = activeIdx >= idx && activeIdx >= 0;
                return `
                    <div class="pm-status-step ${isReached ? 'reached' : ''}">
                        <div class="pm-status-dot">${isReached ? '✓' : idx + 1}</div>
                        <div class="pm-status-label">${s}</div>
                    </div>
                `;
            }).join('');

            return `
                <div class="pm-status-stepper">
                    <div class="pm-status-line">
                        <div class="pm-status-line-fill" style="width: ${progressPct}%;"></div>
                    </div>
                    ${stepsHtml}
                </div>
            `;
        }
    };

    // Helper functions
    function getFutureDate(daysToAdd) {
        const d = new Date();
        d.setDate(d.getDate() + daysToAdd);
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function resumePendingBuyNow() {
        const pending = localStorage.getItem('pendingBuyNow');
        const userId = localStorage.getItem('userId');
        if (!pending || !userId || userId.indexOf('guest_') === 0) return;

        localStorage.removeItem('pendingBuyNow');
        try {
            const product = JSON.parse(pending);
            if (product) {
                setTimeout(() => PickleMartCheckout.startDirectCheckout(product), 0);
            }
        } catch (err) {
            localStorage.removeItem('pendingBuyNow');
        }
    }

    // Auto initialize DOM when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            PickleMartCheckout.init();
            resumePendingBuyNow();
        });
    } else {
        PickleMartCheckout.init();
        resumePendingBuyNow();
    }

    window.PickleMartCheckout = PickleMartCheckout;

})(window, document);
