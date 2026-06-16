/* ===================================
   Canvas Advertising — Main JavaScript
   Complete production build
   =================================== */

// ─── Language Strings ───────────────────────────
const strings = {
    en: {
        viewMore: 'View More Projects',
        showLess: 'Show Less',
        sending: 'Sending...',
        errors: {
            name: 'Please enter your name',
            phone: 'Please enter your phone number',
            phoneInvalid: 'Please enter a valid phone number',
            emailInvalid: 'Please enter a valid email address'
        }
    },
    es: {
        viewMore: 'Ver Más Proyectos',
        showLess: 'Mostrar Menos',
        sending: 'Enviando...',
        errors: {
            name: 'Por favor ingresa tu nombre',
            phone: 'Por favor ingresa tu teléfono',
            phoneInvalid: 'Por favor ingresa un teléfono válido',
            emailInvalid: 'Por favor ingresa un correo válido'
        }
    }
};

const lang = document.documentElement.lang || 'en';
const t = strings[lang] || strings.en;

// ─── GSAP ScrollTrigger Registration ────────────
if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
}

// ─── Bootstrap ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    // Register GSAP plugin (deferred scripts are ready by now)
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
    }

    initPreloader();
    initNavigation();
    initSmoothScroll();
    initHeroCarousel();
    initScrollReveal();
    initDynamicGallery();
    initBeforeAfterSlider();
    initForm();
    initReviews();
    initWhatsAppWidget();
});


/* ===================================
   Preloader
   =================================== */
function initPreloader() {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;

    const barFill = preloader.querySelector('.preloader__bar-fill');

    // Animate bar fill to 100 %
    if (barFill) {
        barFill.style.transition = 'width 1.2s cubic-bezier(.4,0,.2,1)';
        // Force reflow so the transition fires
        void barFill.offsetWidth;
        barFill.style.width = '100%';
    }

    // After page fully loads, fade out the preloader
    window.addEventListener('load', function () {
        preloader.style.transition = 'opacity 0.5s ease';
        preloader.style.opacity = '0';

        preloader.addEventListener('transitionend', function handler() {
            preloader.removeEventListener('transitionend', handler);
            preloader.remove();
            document.body.classList.add('loaded');
        });

        // Safety: if transitionend never fires, remove after 600 ms
        setTimeout(function () {
            if (preloader.parentNode) {
                preloader.remove();
                document.body.classList.add('loaded');
            }
        }, 600);
    });
}


/* ===================================
   Navigation
   =================================== */
function initNavigation() {
    const nav = document.getElementById('nav');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    if (!nav || !navToggle || !navMenu) return;

    // Mobile menu toggle
    navToggle.addEventListener('click', function () {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('.nav__link').forEach(function (link) {
        link.addEventListener('click', function () {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (e) {
        if (!navMenu.contains(e.target) && !navToggle.contains(e.target) && navMenu.classList.contains('active')) {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Scroll shadow
    window.addEventListener('scroll', function () {
        if (window.pageYOffset > 50) {
            nav.classList.add('nav--scrolled');
        } else {
            nav.classList.remove('nav--scrolled');
        }
    });
}


/* ===================================
   Smooth Scroll
   =================================== */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var href = this.getAttribute('href');
            if (href === '#') return;

            var target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                var navHeight = document.getElementById('nav').offsetHeight;
                var targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });
}


/* ===================================
   Hero Cinematic Carousel
   =================================== */
function initHeroCarousel() {
    var slidesContainer = document.getElementById('heroSlides');
    if (!slidesContainer) return;

    var slides      = slidesContainer.querySelectorAll('.hero-cinema__slide');
    var texts       = document.querySelectorAll('.hero-cinema__text');
    var steps       = document.querySelectorAll('.hero-cinema__step');
    var progressBar = document.querySelector('.hero-cinema__progress-fill');
    var prevBtn     = document.getElementById('heroPrev');
    var nextBtn     = document.getElementById('heroNext');
    var heroSection = document.getElementById('hero');

    var total        = slides.length;
    if (total === 0) return;

    var current      = 0;
    var interval     = 6000; // ms per slide
    var timer        = null;
    var isPaused     = false;
    var progressAnim = null; // animation frame id or animation reference

    // ── Go to slide ──────────────────────────────
    function goToSlide(index) {
        // Wrap index
        if (index < 0) index = total - 1;
        if (index >= total) index = 0;
        current = index;

        // Slides
        slides.forEach(function (s) { s.classList.remove('active'); });
        slides[current].classList.add('active');

        // Text
        texts.forEach(function (t) { t.classList.remove('active'); });
        if (texts[current]) texts[current].classList.add('active');

        // Steps
        steps.forEach(function (s) { s.classList.remove('active'); });
        if (steps[current]) steps[current].classList.add('active');

        // Restart progress bar
        startProgress();
    }

    // ── Progress bar animation ───────────────────
    function startProgress() {
        if (!progressBar) return;

        // Reset
        progressBar.style.transition = 'none';
        progressBar.style.width = '0%';

        // Force reflow
        void progressBar.offsetWidth;

        // Animate to 100% over interval duration
        progressBar.style.transition = 'width ' + (interval / 1000) + 's linear';
        progressBar.style.width = '100%';
    }

    // When progress bar finishes → next slide
    if (progressBar) {
        progressBar.addEventListener('transitionend', function () {
            if (!isPaused) {
                goToSlide(current + 1);
            }
        });
    }

    // ── Auto-rotation helpers ────────────────────
    function startAutoRotation() {
        stopAutoRotation();
        // Auto-rotation is driven by the progress bar transitionend
        // We just need to make sure progress is running
        startProgress();
    }

    function stopAutoRotation() {
        // Pause progress bar at current position
        if (progressBar) {
            var computed = getComputedStyle(progressBar).width;
            progressBar.style.transition = 'none';
            progressBar.style.width = computed;
        }
    }

    // ── Arrow buttons ────────────────────────────
    if (prevBtn) {
        prevBtn.addEventListener('click', function () {
            goToSlide(current - 1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function () {
            goToSlide(current + 1);
        });
    }

    // ── Step / indicator buttons ─────────────────
    steps.forEach(function (step) {
        step.addEventListener('click', function () {
            var idx = parseInt(this.dataset.index, 10);
            if (!isNaN(idx)) goToSlide(idx);
        });
    });

    // ── Pause on hover / resume on leave ─────────
    if (heroSection) {
        heroSection.addEventListener('mouseenter', function () {
            isPaused = true;
            stopAutoRotation();
        });

        heroSection.addEventListener('mouseleave', function () {
            isPaused = false;
            startAutoRotation();
        });
    }

    // ── Kick things off ──────────────────────────
    goToSlide(0);
}


/* ===================================
   GSAP Scroll-Triggered Reveal
   =================================== */
function initScrollReveal() {
    var revealEls = document.querySelectorAll('[data-reveal]');
    if (revealEls.length === 0) return;

    // Grid container selectors for stagger delay
    var gridSelectors = [
        '.services__grid',
        '.why-canvas__grid',
        '.gallery__grid',
        '.process__grid',
        '.company-stats__grid',
        '.testimonials__grid'
    ];

    // Apply staggered transition-delay to children inside grids
    gridSelectors.forEach(function (sel) {
        var grid = document.querySelector(sel);
        if (!grid) return;
        var children = grid.querySelectorAll('[data-reveal]');
        children.forEach(function (child, i) {
            child.style.transitionDelay = (i * 0.1) + 's';
        });
    });

    // Use GSAP ScrollTrigger if available, otherwise fall back to IntersectionObserver
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        revealEls.forEach(function (el) {
            ScrollTrigger.create({
                trigger: el,
                start: 'top 85%',
                once: true,
                onEnter: function () {
                    el.classList.add('revealed');
                }
            });
        });
    } else {
        // Fallback: IntersectionObserver
        var observer = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    obs.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -15% 0px', threshold: 0 });

        revealEls.forEach(function (el) { observer.observe(el); });
    }
}


/* ===================================
   Dynamic Gallery from Firestore
   =================================== */
function initDynamicGallery() {
    var galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) {
        initGalleryFilters();
        initLightbox();
        return;
    }

    // Try to get database from window.CanvasFirebase
    var database = null;
    if (window.CanvasFirebase && typeof window.CanvasFirebase.getDb === 'function') {
        database = window.CanvasFirebase.getDb();
    } else if (typeof firebase !== 'undefined' && firebase.firestore) {
        database = firebase.firestore();
    }

    if (!database) {
        console.warn("Firestore not available. Using static gallery.");
        initGalleryFilters();
        initLightbox();
        return;
    }

    database.collection('canvas_projects')
        .orderBy('createdAt', 'desc')
        .get()
        .then(function (snapshot) {
            if (snapshot.empty) {
                console.log("No dynamic projects found in Firestore. Using static gallery.");
                initGalleryFilters();
                initLightbox();
                return;
            }

            // Clear static gallery items
            galleryGrid.innerHTML = '';

            snapshot.forEach(function (doc) {
                var project = doc.data();
                var category = project.category || 'print';
                
                // Map category names based on language
                var catLabel = 'Printing';
                if (lang === 'es') {
                    catLabel = category === 'wraps' ? 'Rotulación de Vehículos' : (category === 'signs' ? 'Letreros y Anuncios' : 'Impresión Comercial');
                } else {
                    catLabel = category === 'wraps' ? 'Vehicle Wraps' : (category === 'signs' ? 'Signage' : 'Printing');
                }

                var item = document.createElement('div');
                item.className = 'gallery__item';
                item.dataset.category = category;
                if (project.featured) {
                    item.dataset.featured = 'true';
                }

                item.innerHTML = `
                    <div class="gallery__image-wrapper">
                        <img class="gallery__image" loading="lazy" src="${project.featuredImage}" alt="${project.title}">
                        <div class="gallery__overlay">
                            <span class="gallery__category">${catLabel}</span>
                            <span class="gallery__title">${project.title}</span>
                            <span class="gallery__location">${project.location || 'Austin, TX'}</span>
                        </div>
                    </div>
                `;
                galleryGrid.appendChild(item);
            });

            console.log("Loaded " + snapshot.size + " projects dynamically from Firestore.");
            
            // Re-run animation reveal classes
            if (typeof initScrollReveal === 'function') {
                galleryGrid.querySelectorAll('.gallery__item').forEach(function (item) {
                    item.setAttribute('data-reveal', '');
                });
                initScrollReveal();
            }

            // Initialize filters and lightbox with the new elements
            initGalleryFilters();
            initLightbox();
        })
        .catch(function (error) {
            console.error("Error fetching projects from Firestore:", error);
            // Fallback to static
            initGalleryFilters();
            initLightbox();
        });
}


/* ===================================
   Gallery Filters
   =================================== */
function initGalleryFilters() {
    var filterButtons = document.querySelectorAll('.gallery__filter');
    var galleryGrid   = document.getElementById('galleryGrid');
    if (!galleryGrid) return;

    var galleryItems = galleryGrid.querySelectorAll('.gallery__item');

    filterButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            var filter = this.dataset.filter;

            // Update active button
            filterButtons.forEach(function (btn) { btn.classList.remove('active'); });
            this.classList.add('active');

            // Filter items
            galleryItems.forEach(function (item) {
                var category = item.dataset.category;

                if (filter === 'all' || category === filter) {
                    item.style.display = '';
                    item.style.opacity = '0';
                    item.style.transform = 'scale(0.9)';

                    // Animate in
                    setTimeout(function () {
                        item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        item.style.opacity = '1';
                        item.style.transform = 'scale(1)';
                    }, 50);
                } else {
                    item.style.opacity = '0';
                    item.style.transform = 'scale(0.9)';

                    setTimeout(function () {
                        item.style.display = 'none';
                    }, 300);
                }
            });
        });
    });
}


/* ===================================
   Lightbox Gallery
   =================================== */
function initLightbox() {
    var lightbox      = document.getElementById('lightbox');
    var lightboxImage = document.getElementById('lightboxImage');
    var lightboxInfo  = document.getElementById('lightboxInfo');
    var lightboxClose = document.getElementById('lightboxClose');
    var lightboxPrev  = document.getElementById('lightboxPrev');
    var lightboxNext  = document.getElementById('lightboxNext');

    if (!lightbox || !lightboxImage) return;

    var currentIndex = 0;

    // Helper: get currently visible gallery items
    function getVisibleItems() {
        return Array.from(document.querySelectorAll('.gallery__item')).filter(function (item) {
            return item.style.display !== 'none';
        });
    }

    // Open lightbox for a given gallery item
    function openLightbox(item, visibleItems) {
        var img = item.querySelector('.gallery__image');
        if (!img) return;

        lightboxImage.src = img.src;
        lightboxImage.alt = img.alt;

        // Populate info from overlay
        var overlay  = item.querySelector('.gallery__overlay');
        if (overlay && lightboxInfo) {
            var catEl  = lightboxInfo.querySelector('.lightbox__category');
            var titEl  = lightboxInfo.querySelector('.lightbox__title');
            var locEl  = lightboxInfo.querySelector('.lightbox__location');

            var srcCat = overlay.querySelector('.gallery__category');
            var srcTit = overlay.querySelector('.gallery__title');
            var srcLoc = overlay.querySelector('.gallery__location');

            if (catEl) catEl.textContent = srcCat ? srcCat.textContent : '';
            if (titEl) titEl.textContent = srcTit ? srcTit.textContent : '';
            if (locEl) locEl.textContent = srcLoc ? srcLoc.textContent : '';
        }

        currentIndex = visibleItems.indexOf(item);
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Close lightbox
    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        lightboxImage.src = '';
    }

    // Navigate to prev / next
    function navigate(direction) {
        var items = getVisibleItems();
        if (items.length === 0) return;

        currentIndex += direction;
        if (currentIndex < 0) currentIndex = items.length - 1;
        if (currentIndex >= items.length) currentIndex = 0;

        openLightbox(items[currentIndex], items);
    }

    // ── Event listeners ──────────────────────────

    // Click on gallery item
    document.querySelectorAll('.gallery__item').forEach(function (item) {
        item.addEventListener('click', function () {
            var visibleItems = getVisibleItems();
            openLightbox(this, visibleItems);
        });
    });

    // Close button
    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }

    // Click backdrop (outside image content)
    lightbox.addEventListener('click', function (e) {
        if (e.target === lightbox) closeLightbox();
    });

    // Prev / Next
    if (lightboxPrev) lightboxPrev.addEventListener('click', function (e) { e.stopPropagation(); navigate(-1); });
    if (lightboxNext) lightboxNext.addEventListener('click', function (e) { e.stopPropagation(); navigate(1);  });

    // Keyboard
    document.addEventListener('keydown', function (e) {
        if (!lightbox.classList.contains('active')) return;

        if (e.key === 'Escape')      closeLightbox();
        if (e.key === 'ArrowLeft')   navigate(-1);
        if (e.key === 'ArrowRight')  navigate(1);
    });
}


/* ===================================
   Before/After Slider
   =================================== */
function initBeforeAfterSlider() {
    var slider     = document.getElementById('beforeAfterSlider');
    var handle     = document.getElementById('sliderHandle');
    var afterImage = document.getElementById('afterImage');

    if (!slider || !handle || !afterImage) return;

    var isDragging = false;

    function updateSlider(clientX) {
        var rect     = slider.getBoundingClientRect();
        var position = (clientX - rect.left) / rect.width;
        position     = Math.max(0, Math.min(1, position));

        var percentage = position * 100;
        handle.style.left          = percentage + '%';
        afterImage.style.clipPath  = 'inset(0 0 0 ' + percentage + '%)';
    }

    // Mouse events
    slider.addEventListener('mousedown', function (e) {
        isDragging = true;
        updateSlider(e.clientX);
    });
    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        updateSlider(e.clientX);
    });
    document.addEventListener('mouseup', function () {
        isDragging = false;
    });

    // Touch events
    slider.addEventListener('touchstart', function (e) {
        isDragging = true;
        updateSlider(e.touches[0].clientX);
    });
    document.addEventListener('touchmove', function (e) {
        if (!isDragging) return;
        updateSlider(e.touches[0].clientX);
    });
    document.addEventListener('touchend', function () {
        isDragging = false;
    });
}


/* ===================================
   Form Handling (Firebase Integration)
   =================================== */
function initForm() {
    var form        = document.getElementById('quoteForm');
    var formSuccess = document.getElementById('formSuccess');

    if (!form) return;

    // Initialize Firebase if available
    if (window.CanvasFirebase) {
        window.CanvasFirebase.init();
    }

    // Track phone clicks
    document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
        link.addEventListener('click', function () {
            if (window.CanvasFirebase) {
                window.CanvasFirebase.trackPhoneClick();
            }
        });
    });

    // Track directions clicks
    document.querySelectorAll('a[href*="maps.google"]').forEach(function (link) {
        link.addEventListener('click', function () {
            if (window.CanvasFirebase) {
                window.CanvasFirebase.trackDirectionsClick();
            }
        });
    });

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Basic validation
        var name  = form.querySelector('#name');
        var phone = form.querySelector('#phone');
        var isValid = true;

        // Reset previous errors
        form.querySelectorAll('.form__error').forEach(function (error) { error.remove(); });
        form.querySelectorAll('.form__input, .form__select, .form__textarea').forEach(function (input) {
            input.style.borderColor = '';
        });

        // Validate name
        if (!name.value.trim()) {
            showError(name, t.errors.name);
            isValid = false;
        }

        // Validate phone
        if (!phone.value.trim()) {
            showError(phone, t.errors.phone);
            isValid = false;
        } else if (!isValidPhone(phone.value)) {
            showError(phone, t.errors.phoneInvalid);
            isValid = false;
        }

        // Validate email if provided
        var email = form.querySelector('#email');
        if (email.value.trim() && !isValidEmail(email.value)) {
            showError(email, t.errors.emailInvalid);
            isValid = false;
        }

        if (!isValid) return;

        // Show loading state
        var submitBtn    = form.querySelector('button[type="submit"]');
        var originalText = submitBtn.textContent;
        submitBtn.textContent = t.sending;
        submitBtn.disabled    = true;

        // Collect form data
        var leadData = {
            name:    name.value.trim(),
            phone:   phone.value.trim(),
            email:   email.value.trim() || null,
            service: form.querySelector('#service').value || null,
            message: form.querySelector('#message').value.trim() || null
        };

        try {
            // Submit to Firebase if available
            if (window.CanvasFirebase && typeof firebase !== 'undefined') {
                await window.CanvasFirebase.submitLead(leadData);
            } else {
                console.log('Lead captured (Firebase not configured):', leadData);
            }

            // Redirect to thank you page
            if (lang === 'es') {
                window.location.href = '/thank-you-es.html';
            } else {
                window.location.href = '/thank-you.html';
            }
        } catch (error) {
            console.error('Error submitting form:', error);

            // Show inline success anyway (don't block user)
            form.style.display = 'none';
            if (formSuccess) formSuccess.style.display = 'block';

            // Store lead locally as backup
            try {
                var pendingLeads = JSON.parse(localStorage.getItem('pending_leads') || '[]');
                pendingLeads.push(Object.assign({}, leadData, { timestamp: new Date().toISOString() }));
                localStorage.setItem('pending_leads', JSON.stringify(pendingLeads));
            } catch (e) {
                console.warn('Could not save lead locally');
            }
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled    = false;
        }
    });

    function showError(input, message) {
        input.style.borderColor = '#E63946';
        var error       = document.createElement('span');
        error.className = 'form__error';
        error.textContent = message;
        error.style.cssText = 'display: block; color: #E63946; font-size: 0.8125rem; margin-top: 0.25rem;';
        input.parentElement.appendChild(error);
    }

    function isValidPhone(phone) {
        var phoneRegex = /^[\d\s\-\(\)\+\.]+$/;
        return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
    }

    function isValidEmail(email) {
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}


/* ===================================
   Utility: Debounce
   =================================== */
function debounce(func, wait) {
    var timeout;
    return function () {
        var context = this;
        var args    = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            func.apply(context, args);
        }, wait);
    };
}


/* ===================================
   Google Reviews Integration
   =================================== */
async function initReviews() {
    var reviewsGrid = document.getElementById('reviewsGrid');
    if (!reviewsGrid || !window.CanvasFirebase) return;

    // Check if we have Firebase Functions
    var functions = null;
    try {
        if (!firebase.apps.length) window.CanvasFirebase.init();
        functions = window.CanvasFirebase.functions;
    } catch (e) {
        console.warn('Firebase not ready for reviews:', e);
        return;
    }

    try {
        var getGoogleReviews = functions.httpsCallable('getGoogleReviews');
        var result = await getGoogleReviews();
        var reviews = result.data;

        if (!reviews || reviews.length === 0) return; // Keep static fallbacks

        // Clear static reviews
        reviewsGrid.innerHTML = '';

        // Render new reviews (limit to 3 for grid)
        reviews.slice(0, 3).forEach(function (review) {
            var text = review.text.length > 150 ? review.text.substring(0, 150) + '...' : review.text;

            var card = document.createElement('div');
            card.className = 'testimonial';
            card.setAttribute('data-reveal', '');
            card.innerHTML =
                '<div class="testimonial__stars">' +
                    Array(5).fill(0).map(function (_, i) {
                        return '<span class="testimonial__star" style="color: ' +
                            (i < (review.rating || 5) ? '#FACC15' : '#444') + '">★</span>';
                    }).join('') +
                '</div>' +
                '<p class="testimonial__text">"' + text + '"</p>' +
                '<div class="testimonial__author">' +
                    '<div class="testimonial__avatar" style="overflow:hidden;">' +
                        (review.profile_photo_url
                            ? '<img src="' + review.profile_photo_url + '" alt="' + review.author_name + '" style="width:100%;height:100%;object-fit:cover;">'
                            : review.author_name.charAt(0)) +
                    '</div>' +
                    '<div class="testimonial__info">' +
                        '<strong>' + review.author_name + '</strong>' +
                        '<span>' + (review.relative_time_description || 'Recent Customer') + '</span>' +
                    '</div>' +
                '</div>';

            reviewsGrid.appendChild(card);
        });

        // Re-init scroll reveal for dynamically inserted cards
        if (typeof ScrollTrigger !== 'undefined') {
            reviewsGrid.querySelectorAll('[data-reveal]').forEach(function (el, i) {
                el.style.transitionDelay = (i * 0.1) + 's';
                ScrollTrigger.create({
                    trigger: el,
                    start: 'top 85%',
                    once: true,
                    onEnter: function () { el.classList.add('revealed'); }
                });
            });
        }

    } catch (error) {
        console.warn('Failed to load Google Reviews:', error);
        // Fallback to static content is automatic
    }
}


/* ===================================
   WhatsApp Chat Widget
   =================================== */
function initWhatsAppWidget() {
    var toggleBtn  = document.getElementById('whatsappToggle');
    var closeBtn   = document.getElementById('whatsappClose');
    var chatWindow = document.getElementById('whatsappWindow');
    var form       = document.getElementById('whatsappForm');
    var successMsg = document.getElementById('whatsappSuccess');

    if (!toggleBtn || !chatWindow || !form) return;

    // Toggle Chat Window
    function toggleChat() {
        chatWindow.classList.toggle('active');

        if (chatWindow.classList.contains('active')) {
            setTimeout(function () {
                var waNameInput = document.getElementById('waName');
                if (waNameInput) waNameInput.focus();
            }, 300);
        }
    }

    toggleBtn.addEventListener('click', toggleChat);
    if (closeBtn) closeBtn.addEventListener('click', toggleChat);

    // Close when clicking outside
    document.addEventListener('click', function (e) {
        if (chatWindow.classList.contains('active') &&
            !chatWindow.contains(e.target) &&
            !toggleBtn.contains(e.target)) {
            chatWindow.classList.remove('active');
        }
    });

    // Handle Form Submission
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        var name      = document.getElementById('waName').value.trim();
        var phone     = document.getElementById('waPhone').value.trim();
        var message   = document.getElementById('waMessage').value.trim();
        var submitBtn = form.querySelector('button[type="submit"]');

        if (!name || !phone || !message) return;

        // Disable button
        var originalContent = submitBtn.innerHTML;
        submitBtn.disabled  = true;
        submitBtn.innerHTML = '<span style="animation: spin 1s linear infinite;">⏳</span>';

        var leadData = {
            name:    name,
            phone:   phone,
            message: message,
            service: 'WhatsApp Inquiry',
            source:  'whatsapp_widget'
        };

        try {
            // 1. Submit to Firebase (CRM)
            if (window.CanvasFirebase) {
                await window.CanvasFirebase.submitLead(leadData);
            } else {
                console.log('Firebase not initialized, logging lead:', leadData);
            }

            // 2. Show Success
            if (successMsg) successMsg.style.display = 'flex';

            // 3. Redirect to WhatsApp after delay
            setTimeout(function () {
                var phoneNumber = '15129459783';
                var waText = encodeURIComponent('Hi, my name is ' + name + '. ' + message);
                var waUrl  = 'https://wa.me/' + phoneNumber + '?text=' + waText;

                window.open(waUrl, '_blank');

                // Reset form and close window
                setTimeout(function () {
                    form.reset();
                    if (successMsg) successMsg.style.display = 'none';
                    chatWindow.classList.remove('active');
                    submitBtn.disabled  = false;
                    submitBtn.innerHTML = originalContent;
                }, 1000);

            }, 1500);

        } catch (error) {
            console.error('Error submitting WhatsApp lead:', error);
            alert('Something went wrong. Redirecting to WhatsApp directly...');

            // Fallback redirect
            window.open('https://wa.me/15129459783', '_blank');
            submitBtn.disabled  = false;
            submitBtn.innerHTML = originalContent;
        }
    });
}
