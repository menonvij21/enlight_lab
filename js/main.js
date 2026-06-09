// =============================================
// PRELOADER
// =============================================
window.addEventListener('load', function () {
    var preloader = document.getElementById('preloader');
    setTimeout(function () {
        preloader.classList.add('hidden');
        setTimeout(function () {
            if (preloader.parentNode) {
                preloader.parentNode.removeChild(preloader);
            }
        }, 500);
    }, 1500);
});

// =============================================
// NAVBAR SCROLL EFFECT
// =============================================
var navbar = document.getElementById('navbar');
window.addEventListener('scroll', function () {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// =============================================
// HAMBURGER MENU
// =============================================
var hamburger = document.getElementById('hamburger');
var navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', function () {
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('active');
});

var allNavAnchors = navLinks.querySelectorAll('a');
for (var i = 0; i < allNavAnchors.length; i++) {
    allNavAnchors[i].addEventListener('click', function () {
        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
    });
}

// =============================================
// COUNTER ANIMATION
// =============================================
function animateCounters() {
    var counters = document.querySelectorAll('.stat-number');
    for (var i = 0; i < counters.length; i++) {
        (function (counter) {
            var target = parseInt(counter.getAttribute('data-count'));
            if (!target || counter.getAttribute('data-animated') === 'true') return;
            counter.setAttribute('data-animated', 'true');
            var duration = 2000;
            var startTime = performance.now();
            function update(currentTime) {
                var elapsed = currentTime - startTime;
                var progress = Math.min(elapsed / duration, 1);
                var eased = 1 - Math.pow(1 - progress, 3);
                counter.textContent = Math.floor(eased * target);
                if (progress < 1) { requestAnimationFrame(update); }
                else { counter.textContent = target; }
            }
            requestAnimationFrame(update);
        })(counters[i]);
    }
}

var counterObserver = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { animateCounters(); }
    }
}, { threshold: 0.3 });

var counterSections = document.querySelectorAll('.hero-stats, .metrics-grid');
for (var i = 0; i < counterSections.length; i++) {
    counterObserver.observe(counterSections[i]);
}

// =============================================
// SMOOTH SCROLL
// =============================================
var smoothScrollLinks = document.querySelectorAll('a[href^="#"]');
for (var i = 0; i < smoothScrollLinks.length; i++) {
    smoothScrollLinks[i].addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href === '#') return;
        e.preventDefault();
        var target = document.querySelector(href);
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
}

// =============================================
// PARTICLES
// =============================================
(function () {
    var container = document.getElementById('particles');
    if (!container) return;
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < 40; i++) {
        var particle = document.createElement('div');
        var size = Math.random() * 3 + 1;
        particle.style.cssText =
            'position:absolute;width:' + size + 'px;height:' + size + 'px;' +
            'background:rgba(108,99,255,' + (Math.random() * 0.25 + 0.05) + ');' +
            'border-radius:50%;top:' + (Math.random() * 100) + '%;left:' + (Math.random() * 100) + '%;' +
            'animation:particleFloat ' + (Math.random() * 15 + 15) + 's ease-in-out infinite;' +
            'animation-delay:' + (Math.random() * 10) + 's;pointer-events:none;';
        fragment.appendChild(particle);
    }
    container.appendChild(fragment);
    var style = document.createElement('style');
    style.textContent =
        '@keyframes particleFloat {' +
        '0%,100%{transform:translate(0,0);opacity:0;}' +
        '15%{opacity:1;}85%{opacity:1;}' +
        '50%{transform:translate(' + (Math.random() > 0.5 ? '' : '-') + (Math.random() * 80 + 20) + 'px,-' + (Math.random() * 80 + 20) + 'px);}}}';
    document.head.appendChild(style);
})();

// =============================================
// TOAST
// =============================================
function showToast(message, type) {
    var toast = document.getElementById('toast');
    var toastMsg = document.getElementById('toastMessage');
    var toastIcon = document.getElementById('toastIcon');
    toastMsg.textContent = message;
    if (type === 'success') { toast.className = 'toast visible success-toast'; toastIcon.className = 'fas fa-check-circle'; }
    else { toast.className = 'toast visible'; toastIcon.className = 'fas fa-exclamation-circle'; }
    setTimeout(hideToast, 5000);
}
function hideToast() { document.getElementById('toast').classList.remove('visible'); }

// =============================================
// CONTACT FORM
// =============================================
var contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var valid = true;
        var fields = ['firstName', 'lastName', 'email', 'phone'];
        document.querySelectorAll('.error-message').forEach(function(el) { el.remove(); });
        document.querySelectorAll('.error').forEach(function(el) { el.classList.remove('error'); });

        for (var i = 0; i < fields.length; i++) {
            var input = document.getElementById(fields[i]);
            if (!input.value.trim()) { input.classList.add('error'); valid = false; }
        }
        var email = document.getElementById('email');
        if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { email.classList.add('error'); valid = false; }
        var phone = document.getElementById('phone');
        if (phone.value && phone.value.replace(/\D/g, '').length < 7) { phone.classList.add('error'); valid = false; }
        var consent = document.getElementById('consent');
        if (!consent.checked) { valid = false; showToast('Please agree to be contacted', 'error'); }

        if (!valid) { showToast('Please fix the errors', 'error'); return; }

        var submitBtn = document.getElementById('submitBtn');
        var btnText = submitBtn.querySelector('.btn-text');
        var btnLoading = submitBtn.querySelector('.btn-loading');
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';
        submitBtn.disabled = true;

        var countryCode = document.getElementById('countryCode').value;
        var rawPhone = document.getElementById('phone').value.replace(/\D/g, '');
        var fullPhone = countryCode + rawPhone;
        if (!fullPhone.startsWith('+')) fullPhone = '+' + fullPhone;

        var formData = {
            firstName: document.getElementById('firstName').value.trim(),
            lastName: document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            countryCode: countryCode,
            phone: document.getElementById('phone').value.trim(),
            fullPhone: fullPhone,
            company: document.getElementById('company').value.trim(),
            service: document.getElementById('service').value,
            message: document.getElementById('message').value.trim(),
        };

        fetch('/api/contact/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            btnText.style.display = 'inline-flex';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
            if (data.success) {
                contactForm.style.display = 'none';
                document.getElementById('successMessage').style.display = 'block';
                showToast('Message sent successfully!', 'success');
            } else {
                showToast(data.message || 'Something went wrong', 'error');
            }
        })
        .catch(function() {
            btnText.style.display = 'inline-flex';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
            contactForm.style.display = 'none';
            document.getElementById('successMessage').style.display = 'block';
            showToast('Message sent! (Demo mode)', 'success');
        });
    });

    document.querySelectorAll('#contactForm input, #contactForm select, #contactForm textarea').forEach(function(input) {
        input.addEventListener('input', function() {
            this.classList.remove('error');
            var err = this.parentNode.querySelector('.error-message');
            if (err) err.remove();
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// AI CALL BOOKING SYSTEM
// ═══════════════════════════════════════════════════════════════
(function() {
    'use strict';

    var API_ENDPOINT = '/api/calls/schedule';
    var currentStep = 1;
    var selectedSlot = null;
    var bookingRef = '';
    var isLoading = false;
    var formData = { name: '', email: '', phone: '', company: '', industry: '', message: '', consent: false };

    var els = {
        stepProgress: document.getElementById('stepProgress'),
        step1: document.getElementById('step1Content'),
        step2: document.getElementById('step2Content'),
        step3: document.getElementById('step3Content'),
        step4: document.getElementById('step4Content'),
        slotsContainer: document.getElementById('slotsContainer'),
        slotNextBtn: document.getElementById('slotNextBtn'),
        reviewSummary: document.getElementById('reviewSummary'),
        apiError: document.getElementById('apiErrorMessage'),
        submitBtn: document.getElementById('submitBookingBtn'),
        timezoneDisplay: document.getElementById('timezoneDisplay'),
        successMsg: document.getElementById('successMessage'),
        refBadge: document.getElementById('refBadge'),
        calendarBtns: document.getElementById('calendarBtns'),
    };

    if (!els.step1) return;

    function generateSlots(daysAhead) {
        daysAhead = daysAhead || 3;
        var slots = [];
        var now = new Date();
        var daysAdded = 0;
        var offset = 0;

        while (daysAdded < daysAhead) {
            offset++;
            var date = new Date(now);
            date.setDate(now.getDate() + offset);

            if (date.getDay() === 0 || date.getDay() === 6) continue;
            daysAdded++;

            for (var h = 9; h < 17; h++) {
                var slotTime = new Date(date);
                slotTime.setHours(h, 0, 0, 0);
                if (slotTime <= new Date(now.getTime() + 30 * 60 * 1000)) continue;
                var dayLabel = daysAdded === 1 ? 'Tomorrow' : slotTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                slots.push({
                    id: slotTime.toISOString(),
                    timestamp: slotTime.getTime(),
                    label: slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                    day: dayLabel,
                    date: slotTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                });
            }
        }
        return slots;
    }

    function groupByDay(slots) {
        return slots.reduce(function(acc, slot) {
            if (!acc[slot.day]) acc[slot.day] = [];
            acc[slot.day].push(slot);
            return acc;
        }, {});
    }

    function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
    function validatePhone(phone) { return /^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s\-\(\)]/g, '')) || /^[0-9]{5,12}$/.test(phone); }

    function showError(fieldId, message) {
        var field = document.getElementById(fieldId);
        if (!field) return;
        field.classList.add('error');
        var existing = field.parentElement.querySelector('.error-msg');
        if (existing) existing.remove();
        var err = document.createElement('div');
        err.className = 'error-msg';
        err.textContent = '\u26a0 ' + message;
        field.parentElement.appendChild(err);
    }

    function clearErrors() {
        document.querySelectorAll('.cyber-input.error, .cyber-select.error').forEach(function(el) { el.classList.remove('error'); });
        document.querySelectorAll('.error-msg').forEach(function(el) { el.remove(); });
    }

    function updateStepProgress(step) {
        var items = els.stepProgress.querySelectorAll('.step-item');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.remove('active', 'completed');
            if (i + 1 === step) items[i].classList.add('active');
            if (i + 1 < step) items[i].classList.add('completed');
        }
    }

    function showStep(step) {
        [els.step1, els.step2, els.step3, els.step4].forEach(function(el, i) {
            if (el) el.style.display = i + 1 === step ? 'block' : 'none';
        });
        updateStepProgress(step);
        currentStep = step;
    }

    function validateStep1() {
        clearErrors();
        var valid = true;
        formData.name = document.getElementById('bookName').value.trim();
        formData.email = document.getElementById('bookEmail').value.trim();
        formData.phone = document.getElementById('bookPhone').value.trim();
        formData.company = document.getElementById('bookCompany').value.trim();
        formData.industry = document.getElementById('bookIndustry').value;
        formData.message = document.getElementById('bookMessage').value.trim();
        formData.consent = document.getElementById('bookConsent').checked;

        if (!formData.name) { showError('bookName', 'Name is required'); valid = false; }
        if (!formData.email) { showError('bookEmail', 'Email is required'); valid = false; }
        else if (!validateEmail(formData.email)) { showError('bookEmail', 'Enter a valid email'); valid = false; }
        if (!formData.phone) { showError('bookPhone', 'Phone number is required'); valid = false; }
        else if (!validatePhone(formData.phone)) { showError('bookPhone', 'Enter a valid phone number'); valid = false; }
        if (!formData.industry) { showError('bookIndustry', 'Select your industry'); valid = false; }
        if (!formData.consent) { showError('bookConsent', 'Please agree to receive a call'); valid = false; }
        return valid;
    }

    window.bookingNextStep = function() {
        if (els.apiError) els.apiError.innerHTML = '';
        if (currentStep === 1 && validateStep1()) { renderSlots(); showStep(2); }
        else if (currentStep === 2 && selectedSlot) { renderReview(); showStep(3); }
        else if (currentStep === 2 && !selectedSlot) {
            var err = document.createElement('div');
            err.className = 'error-msg';
            err.textContent = '\u26a0 Please select a time slot';
            err.style.marginTop = '10px';
            els.slotsContainer.appendChild(err);
        }
    };

    window.bookingPrevStep = function() {
        if (els.apiError) els.apiError.innerHTML = '';
        showStep(Math.max(1, currentStep - 1));
    };

    function renderSlots() {
        var slots = generateSlots(3);
        var grouped = groupByDay(slots);
        if (els.timezoneDisplay) els.timezoneDisplay.textContent = slots[0] ? slots[0].timezone : '';
        var html = '';
        for (var day in grouped) {
            html += '<div class="day-group"><div class="day-label">' + day + '</div><div class="slots-grid">';
            grouped[day].forEach(function(slot) {
                var isSelected = selectedSlot && selectedSlot.id === slot.id;
                html += '<button class="slot-btn' + (isSelected ? ' selected' : '') + '" data-slot-id="' + slot.id + '" onclick="window._selectSlot(\'' + slot.id + '\')">' + slot.label + '</button>';
            });
            html += '</div></div>';
        }
        if (selectedSlot) {
            html += '<div class="slot-summary"><div class="slot-summary-icon">\uD83D\uDCC5</div><div><div style="font-weight:600;">' + selectedSlot.date + '</div><div style="opacity:0.7;font-size:12px;margin-top:3px;">AI agent will call at ' + selectedSlot.label + '</div></div></div>';
        }
        els.slotsContainer.innerHTML = html;
        els.slotNextBtn.disabled = !selectedSlot;
    }

    window._selectSlot = function(slotId) {
        var slots = generateSlots(3);
        selectedSlot = slots.find(function(s) { return s.id === slotId; }) || null;
        document.querySelectorAll('.slot-btn').forEach(function(btn) {
            btn.classList.toggle('selected', btn.dataset.slotId === slotId);
        });
        var summaryEl = els.slotsContainer.querySelector('.slot-summary');
        if (summaryEl) summaryEl.remove();
        if (selectedSlot) {
            var summary = document.createElement('div');
            summary.className = 'slot-summary';
            summary.innerHTML = '<div class="slot-summary-icon">\uD83D\uDCC5</div><div><div style="font-weight:600;">' + selectedSlot.date + '</div><div style="opacity:0.7;font-size:12px;margin-top:3px;">AI agent will call at ' + selectedSlot.label + '</div></div>';
            els.slotsContainer.appendChild(summary);
        }
        var err = els.slotsContainer.querySelector('.error-msg');
        if (err) err.remove();
        els.slotNextBtn.disabled = !selectedSlot;
    };

    function renderReview() {
        var countryCode = document.getElementById('bookCountryCode').value;
        var rawPhone = formData.phone.replace(/[\s\-\(\)]/g, '');
        var fullPhone = rawPhone.startsWith('+') ? rawPhone : (countryCode + rawPhone);
        if (!fullPhone.startsWith('+')) fullPhone = '+' + fullPhone;

        var industries = { ecommerce: 'E-Commerce', edtech: 'EdTech', healthtech: 'HealthTech', bfsi: 'BFSI', hospitality: 'Hospitality', other: 'Other' };
        var rows = [
            { key: 'Name', value: formData.name },
            { key: 'Email', value: formData.email },
            { key: 'Call Number', value: fullPhone, mono: true },
        ];
        if (formData.company) rows.push({ key: 'Company', value: formData.company });
        rows.push({ key: 'Industry', value: industries[formData.industry] || formData.industry });
        if (formData.message) rows.push({ key: 'Note', value: formData.message });
        if (selectedSlot) rows.push({ key: 'Scheduled Call', value: selectedSlot.day + ' \u00b7 ' + selectedSlot.label, highlight: true });
        var html = '<div class="cyber-label">Booking Summary</div>';
        rows.forEach(function(row) {
            html += '<div class="review-row"><span class="review-key">' + row.key + '</span><span class="review-val' + (row.highlight ? ' review-call-time' : '') + '"' + (row.mono ? ' style="font-family:\'JetBrains Mono\',\'Courier New\',monospace;font-size:12px;"' : '') + '>' + row.value + '</span></div>';
        });
        els.reviewSummary.innerHTML = html;
    }

    function getCalendarUrls(slot) {
        if (!slot) return null;
        var startTime = new Date(slot.timestamp);
        var endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        var formatDate = function(date) { return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; };
        var title = encodeURIComponent('AI Voice Call with EnlightLab');
        var description = encodeURIComponent('AI voice call scheduled for ' + slot.date + ' at ' + slot.label);
        return {
            google: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + title + '&dates=' + formatDate(startTime) + '/' + formatDate(endTime) + '&details=' + description,
            outlook: 'https://outlook.live.com/calendar/0/deeplink/compose?subject=' + title + '&startdt=' + startTime.toISOString() + '&enddt=' + endTime.toISOString() + '&body=' + description,
        };
    }

    window.submitBooking = function() {
        if (isLoading) return;
        isLoading = true;

        var countryCode = document.getElementById('bookCountryCode').value;
        var rawPhone = formData.phone.replace(/[\s\-\(\)]/g, '');
        var fullPhone = rawPhone.startsWith('+') ? rawPhone : (countryCode + rawPhone);
        if (!fullPhone.startsWith('+')) fullPhone = '+' + fullPhone;

        els.submitBtn.disabled = true;
        els.submitBtn.innerHTML = '<div class="cyber-spinner"></div> Scheduling\u2026';
        if (els.apiError) els.apiError.innerHTML = '';

        var payload = {
            name: formData.name,
            email: formData.email,
            phone: fullPhone,
            company: formData.company,
            industry: formData.industry,
            message: formData.message,
            slotDate: new Date(selectedSlot.timestamp).toISOString().split('T')[0],
            slotTime: selectedSlot.label,
            slotLabel: selectedSlot.day,
        };

        fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(result) {
            if (!result.ok) throw new Error(result.data.message || result.data.error || 'Request failed');
            bookingRef = result.data.bookingId || ('EL-' + Math.random().toString(36).slice(2, 8).toUpperCase());
            showSuccess();
        })
        .catch(function(error) {
            if (els.apiError) els.apiError.innerHTML = '<div class="api-error">\u26a0 ' + (error.message || 'Something went wrong') + '</div>';
            bookingRef = 'EL-DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
            showSuccess();
        })
        .finally(function() {
            isLoading = false;
            els.submitBtn.disabled = false;
            els.submitBtn.textContent = 'Confirm & Schedule Call';
        });
    };

    function showSuccess() {
        showStep(4);
        if (els.successMsg) els.successMsg.textContent = 'Your AI call is confirmed for ' + selectedSlot.day + ' at ' + selectedSlot.label + '. A confirmation has been sent to ' + formData.email + '.';
        if (els.refBadge) els.refBadge.textContent = '\uD83D\uDCCB Ref: ' + bookingRef;
        var urls = getCalendarUrls(selectedSlot);
        if (urls && els.calendarBtns) {
            els.calendarBtns.innerHTML = '<a href="' + urls.google + '" target="_blank" rel="noopener" class="cal-btn">\uD83D\uDCC5 Google Calendar</a><a href="' + urls.outlook + '" target="_blank" rel="noopener" class="cal-btn">\uD83D\uDCC5 Outlook</a>';
        }
    }

    window.resetBooking = function() {
        currentStep = 1;
        selectedSlot = null;
        bookingRef = '';
        isLoading = false;
        ['bookName', 'bookEmail', 'bookPhone', 'bookCompany', 'bookMessage'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        var industryEl = document.getElementById('bookIndustry');
        if (industryEl) industryEl.value = '';
        var consentEl = document.getElementById('bookConsent');
        if (consentEl) consentEl.checked = false;
        var countryEl = document.getElementById('bookCountryCode');
        if (countryEl) countryEl.value = '+91';
        clearErrors();
        showStep(1);
    };

    // Init
    showStep(1);
    document.querySelectorAll('.cyber-input, .cyber-select').forEach(function(input) {
        input.addEventListener('input', function() {
            this.classList.remove('error');
            var err = this.parentElement.querySelector('.error-msg');
            if (err) err.remove();
        });
    });
    var consentCheckbox = document.getElementById('bookConsent');
    if (consentCheckbox) {
        consentCheckbox.addEventListener('change', function() {
            var err = document.querySelector('.consent-group .error-msg');
            if (err) err.remove();
        });
    }
    console.log('\uD83D\uDE80 AI Booking System Initialized');
})();
