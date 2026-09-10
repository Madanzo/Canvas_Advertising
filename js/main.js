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
    if (document.getElementById('canvasQuoteForm')) {
        window.initCanvasQuote();
        return;
    }
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

/* Quote request: stable Canvas service keys, bilingual presentation, callable-only writes. */
(function (scope) {
  "use strict";
  const SERVICES = Object.freeze([
    [
      "wrap_production_only",
      "Wrap Production Only",
      "Paneles de wrap listos para instalar",
      "wrap-production",
    ],
    [
      "wholesale_printing",
      "Print Partner / Wholesale Vinyl Printing",
      "Impresión de vinil al mayoreo",
      "print-partner",
    ],
    [
      "vinyl_large_format_printing",
      "Vinyl & Large-Format Printing",
      "Impresión de vinil y gran formato",
      "large-format",
    ],
    [
      "window_graphics",
      "Perforated Window Vinyl / Storefront Glass",
      "Gráficos para ventanas y escaparates",
      "perforated-window-vinyl",
    ],
    [
      "wall_murals",
      "Wall Murals & Interior Vinyl",
      "Murales y vinil interior",
      "interior-branding",
    ],
    [
      "contour_cut_decals",
      "Contour-Cut Decals",
      "Calcomanías con corte de contorno",
      "decals",
    ],
    [
      "cutting_lamination",
      "Cutting & Lamination",
      "Corte y laminado",
      "lamination-cutting",
    ],
    [
      "vehicle_wraps",
      "Vehicle Wraps",
      "Wraps comerciales y flotillas",
      "vehicle-wraps",
    ],
    [
      "print_collateral",
      "Flyers & Business Cards (Secondary)",
      "Flyers, tarjetas y menús",
      "short-run-digital",
    ],
    ["other", "Other", "Otro / ayuda para elegir", "other"],
  ]);
  const PRODUCTS = [
    ["printed_vinyl", "Printed vinyl", "Vinil impreso"],
    ["banners", "Banners", "Lonas impresas"],
    ["coroplast", "Coroplast signs", "Letreros de coroplast"],
    ["acm", "ACM signs", "Letreros de ACM"],
    [
      "window_graphics",
      "Window & storefront graphics",
      "Gráficos para ventanas y escaparates",
    ],
    ["wall_murals", "Wall murals", "Murales para paredes"],
    ["stickers_decals", "Stickers & decals", "Stickers y calcomanías"],
    [
      "vehicle_wraps",
      "Commercial vehicle & fleet wraps",
      "Rotulación de vehículos y flotillas",
    ],
    [
      "print_collateral",
      "Flyers, business cards & menus",
      "Flyers, tarjetas y menús",
    ],
    ["other", "Other / Help me choose", "Otro / Ayúdame a elegir"],
  ];
  const OPTIONS = {
    commercial: ["Commercial", "Comercial"],
    premium: ["Premium", "Premium"],
    coroplast: ["Coroplast", "Coroplast"],
    acm: ["ACM", "ACM"],
    recommend: ["Recommend a material", "Recomendar un material"],
    wrap: ["Printed wrap film", "Vinil impreso para wrap"],
    vinyl: ["Printed adhesive vinyl", "Vinil adhesivo impreso"],
    perforated: ["Perforated window vinyl", "Vinil perforado para ventanas"],
    wall: ["Wall mural vinyl", "Vinil para mural"],
    banner: ["Banner vinyl", "Vinil para banner"],
    sign: [
      "Sign substrate — please advise",
      "Sustrato para letrero — recomendar",
    ],
    paper: ["Paper", "Papel"],
    card: ["Card stock", "Cartulina"],
    supplied: [
      "Customer-supplied material — review needed",
      "Material del cliente — requiere revisión",
    ],
    advise: ["Recommend a finish", "Recomendar un acabado"],
    matte: ["Matte laminate", "Laminado mate"],
    gloss: ["Gloss laminate", "Laminado brillante"],
    none: ["No lamination", "Sin laminado"],
    pickup: [
      "Austin pickup · print-only",
      "Recoger en Austin · solo impresión",
    ],
    delivery: ["Local delivery · print-only", "Entrega local · solo impresión"],
    shipping: ["Shipping · print-only", "Envío · solo impresión"],
    installation: ["Request installation", "Solicitar instalación"],
  };
  const PRODUCT_SERVICES = Object.freeze({
    printed_vinyl: "vinyl_large_format_printing",
    banners: "vinyl_large_format_printing",
    coroplast: "vinyl_large_format_printing",
    acm: "vinyl_large_format_printing",
    window_graphics: "window_graphics",
    wall_murals: "wall_murals",
    stickers_decals: "contour_cut_decals",
    vehicle_wraps: "vehicle_wraps",
    print_collateral: "print_collateral",
    other: "other",
  });
  function route(d) {
    if (d.serviceMode === "cutting_lamination") return "cutting_lamination";
    if (!PRODUCT_SERVICES[d.product]) throw new Error("service");
    if (d.product === "printed_vinyl") {
      if (
        !["general", "vehicle_panels", "replacement_panels"].includes(
          d.vinylUse,
        )
      )
        throw new Error("service");
      if (d.vinylUse !== "general") return "wrap_production_only";
      if (d.serviceMode === "wholesale_printing") return "wholesale_printing";
    }
    return PRODUCT_SERVICES[d.product];
  }
  function resolveLink(params) {
    const key =
      params.get("service") || params.get("product") || params.get("project");
    const defaults = {
      product: "printed_vinyl",
      vinylUse: "general",
      serviceMode: "",
      collateralProduct: "flyers",
    };
    if (!key) return defaults;
    const links = {
      wrap_production_only: {
        product: "printed_vinyl",
        vinylUse: "vehicle_panels",
      },
      "wrap-production": {
        product: "printed_vinyl",
        vinylUse: "vehicle_panels",
      },
      "vehicle-wrap-panels": {
        product: "printed_vinyl",
        vinylUse: "vehicle_panels",
      },
      "replacement-wrap-panel": {
        product: "printed_vinyl",
        vinylUse: "replacement_panels",
      },
      "fleet-wraps": { product: "vehicle_wraps" },
      "vehicle-wrap": { product: "vehicle_wraps" },
      "wrap-panels": { product: "printed_vinyl", vinylUse: "vehicle_panels" },
      "replacement-panels": {
        product: "printed_vinyl",
        vinylUse: "replacement_panels",
      },
      wholesale_printing: {
        product: "printed_vinyl",
        serviceMode: "wholesale_printing",
      },
      "wholesale-vinyl": {
        product: "printed_vinyl",
        serviceMode: "wholesale_printing",
      },
      "print-partner": {
        product: "printed_vinyl",
        serviceMode: "wholesale_printing",
      },
      cutting_lamination: { serviceMode: "cutting_lamination" },
      "lamination-cutting": { serviceMode: "cutting_lamination" },
      vinyl_large_format_printing: { product: "printed_vinyl" },
      "large-format": { product: "printed_vinyl" },
      "vinyl-banners": { product: "banners" },
      contour_cut_decals: { product: "stickers_decals" },
      "contour-cut-decals": { product: "stickers_decals" },
      decals: { product: "stickers_decals" },
      "perforated-window-vinyl": { product: "window_graphics" },
      "window-graphics": { product: "window_graphics" },
      "wall-murals": { product: "wall_murals" },
      "interior-branding": { product: "wall_murals" },
      "fleet-graphics": { product: "vehicle_wraps" },
      "vehicle-wraps": { product: "vehicle_wraps" },
      "food-truck": { product: "vehicle_wraps" },
      "ricoh-print": { product: "print_collateral" },
      "short-run-digital": { product: "print_collateral" },
      "restaurant-menus": {
        product: "print_collateral",
        collateralProduct: "menus",
      },
    };
    if (links[key]) return { ...defaults, ...links[key] };
    if (PRODUCT_SERVICES[key]) return { ...defaults, product: key };
    return { ...defaults, product: "" }; // Require an explicit choice for unsupported links.
  }
  function config(d) {
    const product =
      d.serviceMode === "cutting_lamination" ? "finishing" : d.product;
    const paper = product === "print_collateral";
    const material =
      product === "printed_vinyl"
        ? ["recommend", "vinyl"]
        : product === "banners"
          ? ["recommend", "banner"]
          : ["coroplast", "acm"].includes(product)
            ? [product]
            : paper
              ? [
                  "recommend",
                  d.collateralProduct === "business_cards" ? "card" : "paper",
                ]
              : product === "wall_murals"
                ? ["recommend", "wall"]
                : product === "window_graphics"
                  ? ["recommend", "perforated", "vinyl"]
                  : product === "finishing"
                    ? ["supplied"]
                    : ["recommend", "vinyl"];
    const install = [
      "vehicle_wraps",
      "window_graphics",
      "wall_murals",
      "coroplast",
      "acm",
      "other",
    ].includes(product);
    return {
      vehicle: product === "vehicle_wraps",
      dimensions: product !== "vehicle_wraps",
      material,
      vinylGrade: product === "printed_vinyl",
      lamination: paper ? ["none"] : ["advise", "matte", "gloss", "none"],
      fulfillment: [
        "pickup",
        "delivery",
        "shipping",
        ...(install ? ["installation"] : []),
      ],
    };
  }
  const toFeet = { in: 1 / 12, ft: 1, cm: 1 / 30.48, mm: 1 / 304.8 };
  function area(pieces) {
    return pieces.reduce(
      (sum, p) =>
        sum +
        Number(p.width) *
          Number(p.height) *
          toFeet[p.unit] ** 2 *
          Number(p.quantity),
      0,
    );
  }
  function validate(data, step) {
    const errors = [];
    const rules = config(data);
    if (step === 0) {
      try {
        route(data);
      } catch (_) {
        errors.push("service");
      }
      if (
        data.product === "print_collateral" &&
        !["flyers", "business_cards", "menus"].includes(data.collateralProduct)
      )
        errors.push("service");
    }
    if (step === 1) {
      if (rules.vehicle) {
        if (
          !data.vehicle.trim() ||
          !Number.isInteger(+data.vehicleCount) ||
          +data.vehicleCount < 1 ||
          +data.vehicleCount > 1000
        )
          errors.push("vehicle");
      } else if (
        !data.measurementHelp &&
        (!data.pieces.length ||
          data.pieces.length > 10 ||
          data.pieces.some(
            (p) =>
              !toFeet[p.unit] ||
              ![+p.width, +p.height].every(
                (n) => Number.isFinite(n) && n > 0 && n <= 100000,
              ) ||
              !Number.isInteger(+p.quantity) ||
              +p.quantity < 1 ||
              +p.quantity > 100000,
          ))
      )
        errors.push("dimensions");
    }
    if (step === 2) {
      if (rules.vinylGrade && !["recommend", "commercial", "premium"].includes(data.vinylGrade || "recommend")) errors.push("material");
      if (
        !rules.material.includes(data.material) ||
        !rules.lamination.includes(data.lamination)
      )
        errors.push("material");
      if (
        (data.product === "stickers_decals" &&
          !["rectangular", "around_design"].includes(data.cutStyle)) ||
        (data.product === "banners" &&
          ![
            "recommend",
            "trimmed",
            "hems",
            "grommets",
            "hems_grommets",
          ].includes(data.bannerFinish)) ||
        (data.product === "print_collateral" &&
          !(
            data.collateralProduct === "menus"
              ? ["recommend", "unlaminated", "hard_laminated"]
              : ["recommend", "unlaminated"]
          ).includes(data.paperFinish)) ||
        (data.serviceMode === "cutting_lamination" &&
          !["cutting", "lamination", "both"].includes(data.finishingRequest))
      )
        errors.push("material");
      if (data.notes.length > 1200) errors.push("notes");
    }
    if (step === 3) {
      if (!rules.fulfillment.includes(data.fulfillment))
        errors.push("fulfillment");
      if (
        data.fulfillment !== "pickup" &&
        !/^\d{5}(?:-\d{4})?$/.test(data.zip.trim())
      )
        errors.push("zip");
      if (
        data.completionDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(data.completionDate) ||
          data.completionDate < new Date().toLocaleDateString("en-CA"))
      )
        errors.push("date");
    }
    if (step === 4) {
      if (data.name.trim().length < 2 || data.name.length > 120)
        errors.push("name");
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
        data.email.length > 254
      )
        errors.push("email");
      const n = data.phone.replace(/\D/g, "");
      if (n.length < 10 || n.length > 15) errors.push("phone");
    }
    return errors;
  }
  function validateFiles(files) {
    const types = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
      "application/postscript",
      "application/illustrator",
      "application/octet-stream",
    ];
    if (
      files.length > 10 ||
      files.some(
        (f) =>
          !f.size ||
          f.size > 20 * 1024 * 1024 ||
          !/\.(jpg|jpeg|png|webp|heic|heif|pdf|ai|eps)$/i.test(f.name) ||
          (f.type && !types.includes(f.type)),
      )
    )
      throw new Error("files");
  }
  function buildPayload(d, locale, context = {}) {
    const serviceId = route(d);
    const service = SERVICES.find((s) => s[0] === serviceId);
    if (!service) throw new Error("service");
    const rules = config(d);
    const vinylGrade = rules.vinylGrade ? (d.vinylGrade || "recommend") : "";
    if (rules.vinylGrade && !["recommend", "commercial", "premium"].includes(vinylGrade)) throw new Error("vinylGrade");
    const request = {
      version: 1,
      serviceId,
      product:
        serviceId === "cutting_lamination" ? "finishing_services" : d.product,
      productDetail:
        serviceId === "cutting_lamination"
          ? d.finishingRequest
          : d.product === "printed_vinyl"
            ? d.vinylUse
            : d.product === "print_collateral"
              ? d.collateralProduct
              : d.product,
      businessRole: [
        "business_owner",
        "installer",
        "print_reseller",
        "other",
      ].includes(d.businessRole)
        ? d.businessRole
        : "",
      cutStyle:
        d.product === "stickers_decals" && serviceId !== "cutting_lamination"
          ? d.cutStyle
          : "",
      bannerFinish:
        d.product === "banners" && serviceId !== "cutting_lamination"
          ? d.bannerFinish
          : "",
      paperFinish:
        d.product === "print_collateral" && serviceId !== "cutting_lamination"
          ? d.paperFinish
          : "",
      legacyRoute:
        serviceId === "wholesale_printing" ? "wholesale_printing" : "",
      measurementHelp: rules.dimensions && d.measurementHelp,
      pieces:
        rules.dimensions && !d.measurementHelp
          ? d.pieces.map((p) => ({
              width: +p.width,
              height: +p.height,
              unit: p.unit,
              quantity: +p.quantity,
            }))
          : [],
      areaSqFt:
        rules.dimensions && !d.measurementHelp
          ? Number(area(d.pieces).toFixed(4))
          : null,
      vehicle: rules.vehicle ? d.vehicle : "",
      vehicleCount: rules.vehicle ? +d.vehicleCount : null,
      coverage: rules.vehicle ? d.coverage : "",
      material: d.material,
      vinylGrade,
      lamination: d.lamination,
      artwork: d.artwork,
      fulfillment: d.fulfillment,
      installationRequested: d.fulfillment === "installation",
      zip: d.fulfillment === "pickup" ? "" : d.zip,
      completionDate: d.completionDate,
      rush: d.rush,
      notes: d.notes,
      smsConsent: d.smsConsent,
      smsConsentText: d.smsConsentText,
      smsConsentVersion: "quote-sms-2026-09-10",
      smsConsentRecordedAt: context.now || new Date().toISOString(),
      consentLocale: locale,
    };
    // The human-readable message is explicitly mapped by the CRM contract.
    const es = locale === "es",
      tr = (en, sp) => (es ? sp : en);
    const option = (key) => OPTIONS[key]?.[es ? 1 : 0] || key;
    const gradeLabel = {recommend: tr("Recommend a grade", "Recomiéndenme una opción"), commercial: tr("Commercial", "Comercial"), premium: tr("Premium", "Premium")}[request.vinylGrade];
    const artworkLabel = {
      ready: tr("Print-ready artwork", "Arte listo para imprimir"),
      review: tr("File review requested", "Revisión de archivos"),
      design: tr("Design assistance", "Ayuda con diseño"),
    }[d.artwork];
    const coverageLabel = {
      recommend: tr("Help choosing coverage", "Ayuda para elegir cobertura"),
      graphics: tr("Logos / lettering", "Logos / letras"),
      partial: tr("Partial wrap", "Wrap parcial"),
      full: tr("Full commercial wrap", "Wrap comercial completo"),
    }[d.coverage];
    const detailLabels = {
      general: tr("General graphics", "Gráficos generales"),
      vehicle_panels: tr(
        "Vehicle panels · printing only",
        "Paneles vehiculares · solo impresión",
      ),
      replacement_panels: tr(
        "Replacement vehicle panels · printing only",
        "Paneles vehiculares de reemplazo · solo impresión",
      ),
      flyers: "Flyers",
      business_cards: tr("Business cards", "Tarjetas de presentación"),
      menus: tr("Menus", "Menús"),
      rectangular: tr("Rectangular cut", "Corte rectangular"),
      around_design: tr("Cut around the design", "Corte alrededor del diseño"),
      recommend: tr("Recommend an option", "Recomendar una opción"),
      trimmed: tr("Trimmed edges", "Bordes recortados"),
      hems: tr("Hems", "Dobladillos"),
      grommets: tr("Grommets", "Ojillos"),
      hems_grommets: tr("Hems and grommets", "Dobladillos y ojillos"),
      unlaminated: tr("No lamination", "Sin laminado"),
      hard_laminated: tr("Hard-laminated menu", "Menú con laminado rígido"),
      cutting: tr("Cutting", "Corte"),
      lamination: tr("Lamination", "Laminado"),
      both: tr("Cutting and lamination", "Corte y laminado"),
      business_owner: tr("Business owner", "Dueño de negocio"),
      installer: tr("Installer", "Instalador"),
      print_reseller: tr("Print reseller", "Revendedor de impresión"),
      other: tr("Other", "Otro"),
    };
    const productLabel =
      serviceId === "cutting_lamination"
        ? tr(
            "Finishing existing printed material",
            "Acabado de material ya impreso",
          )
        : PRODUCTS.find((p) => p[0] === d.product)?.[es ? 2 : 1];
    const summary = [
      service[es ? 2 : 1],
      productLabel,
      detailLabels[request.productDetail] || "",
      ...[request.cutStyle, request.bannerFinish, request.paperFinish]
        .filter(Boolean)
        .map((k) => detailLabels[k]),
      request.businessRole
        ? tr("Customer role: ", "Tipo de cliente: ") +
          detailLabels[request.businessRole]
        : "",
      request.measurementHelp
        ? tr("Measurement help requested", "Solicito ayuda para medir")
        : request.pieces
            .map(
              (p) =>
                `${p.width} × ${p.height} ${p.unit} × ${p.quantity} ${tr("pieces", "piezas")}`,
            )
            .join("; "),
      request.areaSqFt === null
        ? ""
        : `${tr("Finished area", "Área final")}: ${request.areaSqFt} ${tr("sq ft", "pies²")}`,
      request.vehicle
        ? `${request.vehicle} × ${request.vehicleCount}; ${coverageLabel}`
        : "",
      ...(rules.vinylGrade ? [`${tr("Vinyl grade", "Grado de vinil")}: ${gradeLabel}`] : []),
      `${tr("Material", "Material")}: ${option(d.material)}; ${tr("lamination", "laminado")}: ${option(d.lamination)}; ${tr("artwork", "arte")}: ${artworkLabel}`,
      `${tr("Fulfillment", "Entrega")}: ${option(d.fulfillment)}${request.zip ? "; ZIP: " + request.zip : ""}`,
      `${tr("Date", "Fecha")}: ${d.completionDate || tr("to confirm", "por confirmar")}; ${tr("rush requested", "urgente solicitado")}: ${d.rush ? tr("yes", "sí") : "no"}`,
      d.company ? `${tr("Company", "Empresa")}: ${d.company}` : "",
      d.notes,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      name: d.name.trim(),
      businessName: d.company.trim(),
      email: d.email.trim(),
      phone: d.phone.trim(),
      service: serviceId,
      source: "production_quote",
      formType: "production_quote",
      locale,
      page: context.page || "",
      referrer: context.referrer || "",
      sourcePage: context.sourcePage || "",
      landingProduct: context.landingProduct || "",
      tracking: context.tracking || {},
      productionRequest: request,
      productionSummary: summary.slice(0, 1000),
      message: summary,
      deadline: d.completionDate,
      productionNotes: d.notes,
      fileUploads: [],
    };
  }
  function createSubmission(client, uuid) {
    let busy = false,
      complete = null,
      frozen = null,
      uploaded = null;
    return {
      async send(payload, files) {
        if (complete) return complete;
        if (busy) return null;
        busy = true;
        try {
          validateFiles(files);
          if (!frozen) frozen = JSON.parse(JSON.stringify(payload));
          if (!uploaded) {
            uploaded = files.length
              ? await client.uploadLeadFiles(files, "production-quote")
              : [];
            frozen.fileUploads = uploaded;
            frozen.submissionId = uploaded[0]?.submissionId || uuid();
          }
          const result = await client.submitLead(frozen);
          if (!result || result.ok !== true) throw new Error("submission");
          complete = result;
          return result;
        } finally {
          busy = false;
        }
      },
    };
  }
  scope.CanvasQuote = {
    SERVICES,
    PRODUCTS,
    route,
    resolveLink,
    OPTIONS,
    config,
    area,
    validate,
    validateFiles,
    buildPayload,
    createSubmission,
  };
  scope.initCanvasQuote = function () {
    const form = document.getElementById("canvasQuoteForm");
    if (!form) return;
    const es = document.documentElement.lang === "es";
    const tr = (en, sp) => (es ? sp : en);
    const $ = (id) => document.getElementById(id);
    let step = 0,
      locked = false;
    const params = new URLSearchParams(location.search);
    const initial = resolveLink(params);
    let serviceMode = initial.serviceMode;
    $("quoteService").value = initial.product;
    $("vinylUse").value = initial.vinylUse;
    $("collateralProduct").value = initial.collateralProduct;
    const errors = {
      service: tr("Choose a product.", "Elija un producto."),
      vehicle: tr(
        "Add vehicle details and a whole-number vehicle count.",
        "Agregue los datos del vehículo y una cantidad entera.",
      ),
      dimensions: tr(
        "Enter positive finished dimensions, units and a whole-number quantity, or choose help measuring.",
        "Ingrese medidas finales positivas, unidades y una cantidad entera, o solicite ayuda para medir.",
      ),
      zip: tr(
        "Enter a valid US ZIP code for delivery or installation.",
        "Ingrese un código postal válido de EE. UU. para entrega o instalación.",
      ),
      name: tr("Enter your full name.", "Ingrese su nombre completo."),
      email: tr(
        "Enter a valid email address.",
        "Ingrese un correo electrónico válido.",
      ),
      phone: tr("Enter a valid phone number.", "Ingrese un teléfono válido."),
      files: tr(
        "Use up to 10 supported files, each nonempty and no larger than 20 MB.",
        "Use hasta 10 archivos admitidos, no vacíos y de hasta 20 MB cada uno.",
      ),
      date: tr(
        "Choose today or a future completion date.",
        "Elija hoy o una fecha futura.",
      ),
      material: tr(
        "Choose a relevant material and finish.",
        "Elija un material y acabado adecuados.",
      ),
      fulfillment: tr(
        "Choose a fulfillment option.",
        "Elija una opción de entrega.",
      ),
      notes: tr(
        "Keep notes under 1,200 characters.",
        "Use menos de 1,200 caracteres en las notas.",
      ),
    };
    function data() {
      return {
        product: $("quoteService").value,
        serviceMode,
        vinylUse: $("vinylUse").value,
        collateralProduct: $("collateralProduct").value,
        businessRole: $("businessRole").value,
        cutStyle: $("cutStyle").value,
        bannerFinish: $("bannerFinish").value,
        paperFinish: $("paperFinish").value,
        finishingRequest: $("finishingRequest").value,
        measurementHelp: $("measurementHelp").checked,
        pieces: Array.from($("pieceRows").children).map((row) =>
          Object.fromEntries(
            Array.from(row.querySelectorAll("[data-piece]")).map((el) => [
              el.dataset.piece,
              el.value,
            ]),
          ),
        ),
        vehicle: $("vehicle").value,
        vehicleCount: $("vehicleCount").value,
        coverage: $("coverage").value,
        material: $("material").value,
        vinylGrade: $("vinylGrade").value,
        lamination: $("lamination").value,
        artwork: $("artwork").value,
        fulfillment: $("fulfillment").value,
        zip: $("zip").value,
        completionDate: $("completionDate").value,
        rush: $("rush").checked,
        name: $("contactName").value,
        company: $("company").value,
        email: $("email").value,
        phone: $("phone").value,
        notes: $("notes").value,
        smsConsent: $("smsConsent").checked,
        smsConsentText: $("smsConsent").parentElement.textContent.trim(),
      };
    }
    function fillOptions(id, keys) {
      const el = $(id),
        old = el.value;
      el.replaceChildren(
        ...keys.map((k) => new Option(OPTIONS[k][es ? 1 : 0], k)),
      );
      if (keys.includes(old)) el.value = old;
    }
    function error(list) {
      $("quoteError").hidden = !list.length;
      $("quoteError").textContent = list.map((k) => errors[k] || k).join(" ");
    }
    function refresh() {
      const d = data(),
        r = config(d);
      const finishing = serviceMode === "cutting_lamination";
      $("vinylGrade").parentElement.hidden = !r.vinylGrade;
      if (!r.vinylGrade) $("vinylGrade").value = "recommend";
      const gradeInformation = {
        recommend: tr(
          "Tell us the application and Canvas will recommend a grade and exact film. Printable films, color-change films and paint protection film (PPF) serve different purposes and are not interchangeable.",
          "Cuéntenos la aplicación y Canvas recomendará el grado y la película exacta. Las películas imprimibles, las de cambio de color y la película de protección de pintura (PPF) tienen usos distintos y no son intercambiables."
        ),
        commercial: tr(
          'Commercial materials we carry include General Formulations and our Canvas Escape film, described by the shop as “Double PR Liner, Gloss / Light Grey Adhesive.” Canvas will confirm the exact printable film for your application. Color-change films and PPF are separate material types.',
          'Entre los materiales comerciales que manejamos están General Formulations y nuestra película Canvas Escape, descrita por el taller como “Double PR Liner, Gloss / Light Grey Adhesive” (liner Double PR, brillante / adhesivo gris claro). Canvas confirmará la película imprimible exacta para su aplicación. Las películas de cambio de color y el PPF son tipos de material distintos.'
        ),
        premium: tr(
          "We work with 3M, Avery Dennison, Aura, KPMF, Evolv, ORACAL, TeckWrap, Aluko Vinyl and other premium films. These are examples of materials we carry, not a guarantee that every brand or film suits every product. Printable films, color-change films and PPF are different; Canvas will confirm the exact film for your application.",
          "Trabajamos con 3M, Avery Dennison, Aura, KPMF, Evolv, ORACAL, TeckWrap, Aluko Vinyl y otras películas premium. Son ejemplos de materiales que manejamos, no una garantía de que cada marca o película sea adecuada para cada producto. Las películas imprimibles, las de cambio de color y el PPF son diferentes; Canvas confirmará la película exacta para su aplicación."
        )
      };
      $("vinylGradeHelp").textContent = gradeInformation[$("vinylGrade").value];
      $("quoteService").parentElement.hidden = finishing;
      $("vinylUse").parentElement.hidden =
        finishing || d.product !== "printed_vinyl";
      $("collateralProduct").parentElement.hidden =
        finishing || d.product !== "print_collateral";
      $("cutStyle").parentElement.hidden = $("cutHelp").hidden =
        finishing || d.product !== "stickers_decals";
      $("bannerFinish").parentElement.hidden =
        finishing || d.product !== "banners";
      $("paperFinish").parentElement.hidden =
        finishing || d.product !== "print_collateral";
      $("finishingRequest").parentElement.hidden = !finishing;
      $("signHelp").hidden =
        finishing || !["coroplast", "acm"].includes(d.product);
      $("lamination").parentElement.hidden =
        !finishing && d.product === "print_collateral";
      $("finishingService").hidden = finishing;
      $("returnProducts").hidden = !serviceMode;
      $("routeNotice").hidden = !serviceMode;
      $("routeNotice").textContent = finishing
        ? tr(
            "Cutting & lamination for your existing printed material.",
            "Corte y laminado para su material ya impreso.",
          )
        : tr(
            "Existing wholesale inquiry route retained. Eligibility and pricing require Canvas confirmation.",
            "Se conserva la ruta de consulta de mayoreo. Canvas debe confirmar elegibilidad y precio.",
          );
      $("vehicleQuestions").hidden = !r.vehicle;
      $("dimensionQuestions").hidden = !r.dimensions;
      $("pieceRows").hidden = d.measurementHelp;
      $("addPiece").hidden = d.measurementHelp;
      $("zip").parentElement.hidden = d.fulfillment === "pickup";
      $("areaTotal").textContent = d.measurementHelp
        ? tr(
            "We’ll help confirm the measurements.",
            "Le ayudaremos a confirmar las medidas.",
          )
        : validate(d, 1).length
          ? ""
          : `${area(d.pieces).toLocaleString(es ? "es-MX" : "en-US", { maximumFractionDigits: 2 })} ${tr("sq ft total finished area · not a price", "pies² de área final total · no es un precio")}`;
      $("serviceHint").textContent =
        d.product === "printed_vinyl" || finishing
          ? tr(
              "Printing and finishing only. Installation is not included. Canvas will confirm the specifications and price.",
              "Solo impresión y acabados. No incluye instalación. Canvas confirmará las especificaciones y el precio.",
            )
          : tr(
              "Share the specifications you know. Canvas will confirm production options and pricing.",
              "Comparta los datos que conoce. Canvas confirmará las opciones de producción y el precio.",
            );
      if (validate(d, 0).length) {
        $("reviewDetails").textContent = "";
        return;
      }
      $("reviewDetails").textContent = buildPayload(
        d,
        es ? "es" : "en",
      ).message;
    }
    function serviceChange() {
      const d = data(),
        r = config(d);
      const paperOptions = $("paperFinish").options;
      for (const option of paperOptions)
        option.hidden =
          option.value === "hard_laminated" && d.collateralProduct !== "menus";
      if (
        d.collateralProduct !== "menus" &&
        $("paperFinish").value === "hard_laminated"
      )
        $("paperFinish").value = "recommend";
      fillOptions("material", r.material);
      fillOptions("lamination", r.lamination);
      fillOptions("fulfillment", r.fulfillment);
      refresh();
    }
    function addPiece() {
      if ($("pieceRows").children.length >= 10) return;
      const row = document.createElement("div");
      row.className = "q-piece";
      const n = $("pieceRows").children.length + 1;
      row.innerHTML = `<span class="q-piece-label">${tr("Piece / size", "Pieza / medida")} ${n}</span><div class="q-piece-grid"><label>${tr("Width", "Ancho")}<input data-piece="width" aria-label="${tr("Width", "Ancho")} ${n}" type="number" min="0.001" max="100000" step="any" inputmode="decimal"></label><span aria-hidden="true">×</span><label>${tr("Height", "Alto")}<input data-piece="height" aria-label="${tr("Height", "Alto")} ${n}" type="number" min="0.001" max="100000" step="any" inputmode="decimal"></label><label>${tr("Units", "Unidades")}<select data-piece="unit" aria-label="${tr("Units", "Unidades")} ${n}"><option value="in">${tr("inches", "pulgadas")}</option><option value="ft">${tr("feet", "pies")}</option><option value="cm">cm</option><option value="mm">mm</option></select></label><label>${tr("Quantity", "Cantidad")}<input data-piece="quantity" aria-label="${tr("Quantity", "Cantidad")} ${n}" type="number" min="1" max="100000" step="1" value="1" inputmode="numeric"></label><button class="q-text-button" type="button" aria-label="${tr("Remove size", "Eliminar medida")} ${n}">${tr("Remove", "Eliminar")}</button></div>`;
      row.querySelector("button").addEventListener("click", () => {
        if (locked) return;
        row.remove();
        refresh();
      });
      $("pieceRows").append(row);
      refresh();
    }
    function show(focus = true) {
      document
        .querySelectorAll(".q-step")
        .forEach((el, i) => (el.hidden = i !== step));
      document.querySelectorAll("[data-progress]").forEach((el, i) => {
        el.classList.toggle("is-current", i === step);
        el.classList.toggle("is-complete", i < step);
        if (i === step) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
      });
      $("quoteBack").hidden = step === 0;
      $("quoteNext").hidden = step === 4;
      $("quoteSubmit").hidden = step !== 4;
      $("stepCount").textContent = `${step + 1} / 5`;
      refresh();
      if (focus) $("q-title-" + step).focus({ preventScroll: true });
    }
    $("quoteService").addEventListener("change", () => {
      serviceMode = "";
      serviceChange();
    });
    $("vinylUse").addEventListener("change", () => {
      serviceMode = "";
      serviceChange();
    });
    $("collateralProduct").addEventListener("change", serviceChange);
    $("finishingService").addEventListener("click", () => {
      if (locked) return;
      serviceMode = "cutting_lamination";
      serviceChange();
    });
    $("returnProducts").addEventListener("click", () => {
      if (locked) return;
      serviceMode = "";
      serviceChange();
    });
    $("addPiece").addEventListener("click", addPiece);
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    $("quoteFiles").addEventListener("change", () => {
      $("fileList").replaceChildren(
        ...Array.from($("quoteFiles").files).map((f) => {
          const li = document.createElement("li");
          li.textContent = `${f.name} · ${(f.size / 1024).toFixed(1)} KB`;
          return li;
        }),
      );
    });
    $("quoteNext").addEventListener("click", () => {
      let list = validate(data(), step);
      if (step === 2)
        try {
          validateFiles(Array.from($("quoteFiles").files));
        } catch (e) {
          list.push("files");
        }
      error(list);
      if (!list.length) {
        step++;
        show();
      }
    });
    $("quoteBack").addEventListener("click", () => {
      if (!locked) {
        error([]);
        step--;
        show();
      }
    });
    let submission;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (step !== 4) {
        $("quoteNext").click();
        return;
      }
      if ($("quoteSubmit").disabled) return;
      const d = data();
      let list = [0, 1, 2, 3, 4].flatMap((i) => validate(d, i));
      try {
        validateFiles(Array.from($("quoteFiles").files));
      } catch (e) {
        list.push("files");
      }
      error(list);
      if (list.length) return;
      if (!scope.CanvasFirebase) {
        error([
          tr(
            "The form service could not load. Refresh this page or call us.",
            "No se pudo cargar el servicio. Actualice la página o llámenos.",
          ),
        ]);
        return;
      }
      if (!submission)
        submission = createSubmission(scope.CanvasFirebase, () =>
          crypto.randomUUID(),
        );
      const tracking = {};
      for (const k of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "gclid",
      ])
        if (params.has(k)) tracking[k] = params.get(k).slice(0, 1000);
      const payload = buildPayload(d, es ? "es" : "en", {
        page: location.pathname,
        referrer: document.referrer.slice(0, 1000),
        sourcePage: (params.get("source") || "").slice(0, 1000),
        landingProduct: (
          params.get("product") ||
          params.get("project") ||
          ""
        ).slice(0, 1000),
        tracking,
      });
      locked = true;
      form
        .querySelectorAll("input,select,textarea,button")
        .forEach((el) => (el.disabled = true));
      $("quoteStatus").textContent = tr(
        "Sending your request securely…",
        "Enviando su solicitud de forma segura…",
      );
      try {
        const result = await submission.send(
          payload,
          Array.from($("quoteFiles").files),
        );
        if (!result) return;
        $("quoteReference").textContent = result.id;
        form.hidden = true;
        $("quoteSuccess").hidden = false;
        $("quoteSuccess").focus();
        if (typeof scope.gtag === "function")
          scope.gtag("event", "generate_lead", { method: "production_quote" });
      } catch (e) {
        $("quoteSubmit").disabled = false;
        $("quoteSubmit").textContent = tr(
          "Retry My Quote",
          "Reintentar mi cotización",
        );
        error([
          tr(
            "We could not confirm your request. Your details are kept here. Retry safely with the same reference, or call (512) 434-3793.",
            "No pudimos confirmar su solicitud. Conservamos sus datos aquí. Reintente con la misma referencia o llame al (512) 945-9783.",
          ),
        ]);
      } finally {
        $("quoteStatus").textContent = "";
      }
    });
    addPiece();
    serviceChange();
    show(false);
    if (typeof scope.gtag !== "function") {
      scope.dataLayer = scope.dataLayer || [];
      scope.gtag = function () {
        scope.dataLayer.push(arguments);
      };
      scope.gtag("js", new Date());
      scope.gtag("config", "G-98HWWM4BDW");
    }
  };
})(window);
