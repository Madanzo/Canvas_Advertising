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

// Global safe helper for GA4 and Meta Pixel conversion events
function sendAnalyticsEvent(gaEvent, gaParams, fbEvent, fbParams) {
    if (typeof gtag === 'function') {
        gtag('event', gaEvent, gaParams);
    }
    if (typeof fbq === 'function') {
        if (fbEvent) {
            fbq('track', fbEvent, fbParams);
        }
    }
}

// Track primary local-lead actions on every public page. This is intentionally
// independent of the homepage quote form so service, resource, and case-study
// pages report the same conversion events.
function initConversionTracking() {
    var commonParams = function (link) {
        return {
            page_path: window.location.pathname,
            link_url: link.href,
            link_text: (link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
            language: document.documentElement.lang || 'en'
        };
    };

    document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
        link.addEventListener('click', function () {
            var params = commonParams(link);
            params.phone_number = link.getAttribute('href').replace('tel:', '');
            if (window.CanvasFirebase && typeof window.CanvasFirebase.trackPhoneClick === 'function') {
                window.CanvasFirebase.trackPhoneClick();
            }
            sendAnalyticsEvent('click_phone', params, 'Contact', {
                content_name: 'Phone Call Link Click',
                content_category: params.language.indexOf('es') === 0 ? 'Spanish Phone' : 'English Phone'
            });
        });
    });

    document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]').forEach(function (link) {
        link.addEventListener('click', function () {
            sendAnalyticsEvent('click_whatsapp', commonParams(link), 'Contact', {
                content_name: 'WhatsApp Link Click'
            });
        });
    });

    document.querySelectorAll('a[href*="maps.google"], a[href*="google.com/maps"]').forEach(function (link) {
        link.addEventListener('click', function () {
            if (window.CanvasFirebase && typeof window.CanvasFirebase.trackDirectionsClick === 'function') {
                window.CanvasFirebase.trackDirectionsClick();
            }
            sendAnalyticsEvent('get_directions', commonParams(link), 'Contact', {
                content_name: 'Directions Link Click'
            });
        });
    });
}

// ─── GSAP ScrollTrigger Registration ────────────
if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
}

// ─── Bootstrap ──────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('commerce-app')) {
        initNavigation();
        window.initCanvasCommerce();
        window.addEventListener('hashchange', () => {
            if (new URLSearchParams(location.hash.slice(1)).has('recover')) location.reload();
        });
        return;
    }
    if (document.getElementById('canvasQuoteForm')) {
        window.initCanvasQuote();
        return;
    }
    // Register GSAP plugin (deferred scripts are ready by now)
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
    }

    // Luxury effects (zero external dependencies — GSAP only)
    initHeroTextSplit();
    initMagneticButtons();
    initHeroParallax();
    initHeroMouseMoveParallax();
    init3DTilt();
    initStatCounters();

    // Core functionality
    initPreloader();
    initNavigation();
    initSmoothScroll();
    initConversionTracking();
    initHeroVideo();
    initHeroCarousel();
    initScrollReveal();
    initBeforeAfterSlider();
    initForm();
    initWhatsAppWidget();
    initPortfolioFilters();
    initQuoteEstimator();
    initCaptureForm();
    initVisibilityPackageForm();
    initProductionCampaignForm();
    initRestaurantMenuCampaign();
    initReviewFunnel();
    initCalendarFallback();

    // Keep database requests and dynamic rendering out of the critical path.
    initWhenVisible('#galleryGrid', function () {
        loadFirebaseSdk().then(initDynamicGallery).catch(initDynamicGallery);
    });
    initWhenVisible('#reviewsGrid', function () {
        loadFirebaseSdk().then(initReviews).catch(function () {});
    });

    // Start loading lead services when someone begins interacting with a form.
    function primeFirebase(event) {
        if (event.target && event.target.closest && event.target.closest('form')) {
            loadFirebaseSdk();
        }
    }
    document.addEventListener('focusin', primeFirebase, { passive: true });
    document.addEventListener('pointerdown', primeFirebase, { passive: true });
});

function loadFirebaseSdk() {
    if (window.CanvasFirebase && typeof window.CanvasFirebase.init === 'function') {
        return Promise.resolve(window.CanvasFirebase);
    }
    if (window.canvasFirebaseLoading) return window.canvasFirebaseLoading;

    var sources = [
        'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
        'https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js',
        'js/firebase-config.js?v=20260725-performance'
    ];

    window.canvasFirebaseLoading = sources.reduce(function (promise, source) {
        return promise.then(function () {
            return new Promise(function (resolve, reject) {
                var script = document.createElement('script');
                script.src = source;
                script.async = true;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        });
    }, Promise.resolve()).then(function () {
        if (window.CanvasFirebase) window.CanvasFirebase.init();
        return window.CanvasFirebase;
    });

    return window.canvasFirebaseLoading;
}

function initRestaurantMenuCampaign() {
    const page = document.querySelector('.restaurant-page');
    if (!page) return;

    const toggle = document.getElementById('restaurantLanguage');
    let language = 'en';

    function setLanguage(nextLanguage) {
        language = nextLanguage;
        document.documentElement.lang = nextLanguage;
        document.querySelectorAll('[data-en][data-es]').forEach(function(element) {
            element.textContent = element.getAttribute('data-' + nextLanguage);
        });
        if (toggle) {
            toggle.textContent = nextLanguage === 'en' ? 'ES' : 'EN';
            toggle.setAttribute('aria-label', nextLanguage === 'en' ? 'Cambiar a español' : 'Switch to English');
        }
    }

    if (toggle) {
        toggle.addEventListener('click', function() {
            setLanguage(language === 'en' ? 'es' : 'en');
        });
        toggle.addEventListener('touchend', function() {
            window.setTimeout(function() {}, 0);
        });
    }

    document.querySelectorAll('.restaurant-contact').forEach(function(link) {
        function trackContact() {
            sendAnalyticsEvent('contact', {
                method: link.getAttribute('data-contact') || 'restaurant-menu',
                campaign: 'restaurant_menu_flyer_2026'
            });
        }
        link.addEventListener('click', trackContact);
        link.addEventListener('touchend', trackContact);
    });
}

function initWhenVisible(selector, callback) {
    var element = document.querySelector(selector);
    if (!element || !('IntersectionObserver' in window)) {
        callback();
        return;
    }

    var observer = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        observer.disconnect();
        callback();
    }, { rootMargin: '900px 0px' });

    observer.observe(element);
}


/* ===================================
   Preloader
   =================================== */
function initPreloader() {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;

    const barFill = preloader.querySelector('.preloader__bar-fill');

    // Give immediate feedback without waiting for media or third parties.
    if (barFill) {
        barFill.style.transition = 'width 0.25s cubic-bezier(.4,0,.2,1)';
        void barFill.offsetWidth;
        barFill.style.width = '100%';
    }

    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            preloader.style.transition = 'opacity 0.2s ease';
            preloader.style.pointerEvents = 'none';
            preloader.style.opacity = '0';

            setTimeout(function () {
                if (preloader.parentNode) preloader.remove();
                document.body.classList.add('loaded');
            }, 220);
        });
    });
}


/* ===================================
   Hero Video
   =================================== */
function initHeroVideo() {
    var video = document.querySelector('.hero-cinema__video[data-video-pending]');
    if (!video) return;

    var loadVideo = function () {
        if (!video.hasAttribute('data-video-pending')) return;
        video.querySelectorAll('source[data-src]').forEach(function (source) {
            source.src = source.getAttribute('data-src');
            source.removeAttribute('data-src');
        });
        video.removeAttribute('data-video-pending');
        video.load();
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(function () { /* Poster remains if autoplay is blocked. */ });
        }
    };

    if (document.readyState === 'complete') {
        setTimeout(loadVideo, 100);
    } else {
        window.addEventListener('load', function () {
            setTimeout(loadVideo, 100);
        }, { once: true });
    }
}


/* ===================================
   Navigation
   =================================== */
function initNavigation() {
    const nav = document.getElementById('nav');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    if (!nav || !navToggle || !navMenu) return;

    initMegaNavigation(nav, navMenu);

    // Mobile menu toggle (click + touch)
    function toggleMobileMenu() {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        navToggle.setAttribute('aria-expanded', navMenu.classList.contains('active') ? 'true' : 'false');
        nav.classList.remove('nav--hidden');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
        // Close any open dropdowns when closing menu
        if (!navMenu.classList.contains('active')) {
            document.querySelectorAll('.nav__item--dropdown.active').forEach(function(item) {
                item.classList.remove('active');
            });
        }
    }
    navToggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleMobileMenu();
    });

    // Keep taps inside the drawer from reaching the document close handler.
    navMenu.addEventListener('click', function (e) {
        e.stopPropagation();
    });

    // Mobile dropdown toggle — close siblings, stop propagation
    document.querySelectorAll('.nav__item--dropdown > .nav__link--dropdown').forEach(function(link) {
        function handleDropdownToggle(e) {
            if (window.innerWidth <= 1024) {
                e.preventDefault();
                e.stopPropagation();
                var parent = this.parentElement;
                // Close all OTHER open dropdowns first
                document.querySelectorAll('.nav__item--dropdown.active').forEach(function(item) {
                    if (item !== parent) {
                        item.classList.remove('active');
                    }
                });
                parent.classList.toggle('active');
            }
        }
        // A normal click also fires after a touch. Binding both click and
        // touchend toggled the dropdown twice on real phones.
        link.addEventListener('click', handleDropdownToggle);
    });

    // Close menu when clicking a NON-dropdown nav link (e.g., Portfolio, Español)
    navMenu.querySelectorAll('.nav__link:not(.nav__link--dropdown)').forEach(function (link) {
        link.addEventListener('click', function () {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        });
    });

    // Close menu when clicking the backdrop overlay (outside menu)
    document.addEventListener('click', function (e) {
        if (!navMenu.contains(e.target) && !navToggle.contains(e.target) && navMenu.classList.contains('active')) {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
            document.querySelectorAll('.nav__item--dropdown.active').forEach(function(item) {
                item.classList.remove('active');
            });
        }
    });

    // Hide on downward scroll and reveal on upward scroll.
    var lastScrollY = Math.max(0, window.pageYOffset);
    var scrollTicking = false;

    function updateNavigationOnScroll() {
        var currentScrollY = Math.max(0, window.pageYOffset);
        var scrollDelta = currentScrollY - lastScrollY;

        if (currentScrollY > 50) {
            nav.classList.add('nav--scrolled');
        } else {
            nav.classList.remove('nav--scrolled');
        }

        if (currentScrollY <= 80 || navMenu.classList.contains('active')) {
            nav.classList.remove('nav--hidden');
        } else if (scrollDelta > 6) {
            nav.classList.add('nav--hidden');
        } else if (scrollDelta < -6) {
            nav.classList.remove('nav--hidden');
        }

        if (Math.abs(scrollDelta) > 6 || currentScrollY <= 80) {
            lastScrollY = currentScrollY;
        }
        scrollTicking = false;
    }

    window.addEventListener('scroll', function () {
        if (!scrollTicking) {
            window.requestAnimationFrame(updateNavigationOnScroll);
            scrollTicking = true;
        }
    }, { passive: true });
}

function initMegaNavigation(nav, navMenu) {
    const logo = nav.querySelector('.nav__logo');
    const quoteLink = nav.querySelector('.nav__quote-btn');
    const isSpanish = document.documentElement.lang && document.documentElement.lang.indexOf('es') === 0;

    if (!logo || document.getElementById('megaNav')) return;

    if (quoteLink && quoteLink.closest('.nav__item')) {
        quoteLink.closest('.nav__item').classList.add('nav__item--quote');
    }

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'nav__mega-trigger';
    menuButton.setAttribute('aria-controls', 'megaNav');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.innerHTML = '<i aria-hidden="true"><span></span><span></span><span></span></i><strong>' + (isSpanish ? 'Menu' : 'Menu') + '</strong>';
    logo.insertAdjacentElement('afterend', menuButton);

    const linkSets = isSpanish ? {
        production: [
            ['Impresion de Vinil al Mayoreo', 'wholesale-vinyl-printing'],
            ['Calcomanias con Corte', 'contour-cut-decals'],
            ['Paneles de Wrap', 'replacement-wrap-panels'],
            ['Vinil para Ventanas', 'window-graphics-printing'],
            ['Murales de Vinil', 'wall-murals-printing'],
            ['Banners de Vinil', 'laminated-vinyl-banners'],
            ['Flyers y Tarjetas Ricoh', 'ricoh-flyers-business-cards']
        ],
        services: [
            ['Rotulacion e Instalacion', 'vehicle-wraps-austin-es'],
            ['Rotulacion de Flotillas', 'commercial-fleet-wraps-austin-es'],
            ['Food Trucks y Trailers', 'food-truck-wraps-austin-es'],
            ['Boat Wraps', 'boat-wraps-austin-es'],
            ['Portal de Socios', 'wholesale-printing-austin-es']
        ],
        company: [
            ['Portafolio', 'portfolio-es'],
            ['Casos de Exito', 'case-studies-es'],
            ['Recursos y Precios', 'resources-es'],
            ['English', 'index']
        ]
    } : {
        production: [
            ['Wholesale Vinyl Printing', 'wholesale-vinyl-printing'],
            ['Contour-Cut Decals', 'contour-cut-decals'],
            ['Replacement Wrap Panels', 'replacement-wrap-panels'],
            ['Window Graphics', 'window-graphics-printing'],
            ['Wall Murals', 'wall-murals-printing'],
            ['Vinyl Banners', 'laminated-vinyl-banners'],
            ['Ricoh Flyers & Cards', 'ricoh-flyers-business-cards']
        ],
        services: [
            ['Vehicle Wraps & Install', 'vehicle-wraps-austin'],
            ['Commercial Fleet Wraps', 'commercial-fleet-wraps-austin'],
            ['Food Truck Wraps', 'food-truck-wraps-austin'],
            ['Boat Wraps', 'boat-wraps-austin'],
            ['Partner With Us', 'partner']
        ],
        company: [
            ['Portfolio', 'portfolio'],
            ['Case Studies', 'case-studies'],
            ['Resources & Pricing', 'resources'],
            ['Español', 'index-es']
        ]
    };

    function buildLinks(items) {
        return items.map(function (item) {
            return '<a href="' + item[1] + '">' + item[0] + '<span>View</span></a>';
        }).join('');
    }

    const megaNav = document.createElement('div');
    megaNav.className = 'mega-nav';
    megaNav.id = 'megaNav';
    megaNav.setAttribute('aria-hidden', 'true');
    megaNav.innerHTML =
        '<button class="mega-nav__close" type="button" aria-label="' + (isSpanish ? 'Cerrar menu' : 'Close menu') + '">×</button>' +
        '<div class="mega-nav__panel" role="dialog" aria-modal="true" aria-label="' + (isSpanish ? 'Menu principal' : 'Main menu') + '">' +
            '<div class="mega-nav__rail">' +
                '<button class="mega-nav__rail-item active" type="button" data-mega-section="production">' + (isSpanish ? 'Produccion' : 'Production') + '</button>' +
                '<button class="mega-nav__rail-item" type="button" data-mega-section="services">' + (isSpanish ? 'Servicios' : 'Services') + '</button>' +
                '<button class="mega-nav__rail-item" type="button" data-mega-section="company">' + (isSpanish ? 'Compañia' : 'Company') + '</button>' +
                '<a class="mega-nav__account" href="' + (isSpanish ? 'quote-es' : 'quote') + '">' + (isSpanish ? 'Cotizar proyecto' : 'Start a quote') + '</a>' +
            '</div>' +
            '<div class="mega-nav__stage">' +
                '<section class="mega-nav__section active" data-mega-panel="production">' +
                    '<p>' + (isSpanish ? 'Print, cut, laminate, package, ship.' : 'Print, cut, laminate, package, ship.') + '</p>' +
                    '<h2>' + (isSpanish ? 'Vinil listo' : 'Vinyl production') + '</h2>' +
                    '<div class="mega-nav__links">' + buildLinks(linkSets.production) + '</div>' +
                '</section>' +
                '<section class="mega-nav__section" data-mega-panel="services">' +
                    '<p>' + (isSpanish ? 'Para negocios locales, flotillas, trailers y talleres.' : 'For local businesses, fleets, trailers, and trade partners.') + '</p>' +
                    '<h2>' + (isSpanish ? 'Wraps y flotillas' : 'Wraps and fleets') + '</h2>' +
                    '<div class="mega-nav__links">' + buildLinks(linkSets.services) + '</div>' +
                '</section>' +
                '<section class="mega-nav__section" data-mega-panel="company">' +
                    '<p>' + (isSpanish ? 'Vea trabajos, recursos y formas de contactar.' : 'See work, resources, and ways to connect.') + '</p>' +
                    '<h2>' + (isSpanish ? 'Canvas Advertising' : 'Canvas Advertising') + '</h2>' +
                    '<div class="mega-nav__links">' + buildLinks(linkSets.company) + '</div>' +
                '</section>' +
            '</div>' +
        '</div>';
    document.body.appendChild(megaNav);

    const closeButton = megaNav.querySelector('.mega-nav__close');
    const railItems = megaNav.querySelectorAll('[data-mega-section]');

    function openMegaNav() {
        megaNav.classList.add('active');
        megaNav.setAttribute('aria-hidden', 'false');
        menuButton.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }

    function closeMegaNav() {
        megaNav.classList.remove('active');
        megaNav.setAttribute('aria-hidden', 'true');
        menuButton.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    }

    menuButton.addEventListener('click', openMegaNav);
    closeButton.addEventListener('click', closeMegaNav);

    megaNav.addEventListener('click', function (event) {
        if (event.target === megaNav) closeMegaNav();
    });

    megaNav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', closeMegaNav);
    });

    railItems.forEach(function (item) {
        item.addEventListener('click', function () {
            const target = item.getAttribute('data-mega-section');
            railItems.forEach(function (railItem) {
                railItem.classList.toggle('active', railItem === item);
            });
            megaNav.querySelectorAll('[data-mega-panel]').forEach(function (panel) {
                panel.classList.toggle('active', panel.getAttribute('data-mega-panel') === target);
            });
        });
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && megaNav.classList.contains('active')) {
            closeMegaNav();
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
                var scrollToTarget = function (behavior, centerTarget) {
                    var nav = document.getElementById('nav');
                    var navHeight = nav ? nav.offsetHeight : 0;
                    var targetRect = target.getBoundingClientRect();
                    var targetPosition = centerTarget
                        ? targetRect.top + window.pageYOffset - Math.max(24, (window.innerHeight - targetRect.height) / 2)
                        : targetRect.top + window.pageYOffset - navHeight - 16;
                    if (behavior === 'auto') {
                        var previousScrollBehavior = document.documentElement.style.scrollBehavior;
                        document.documentElement.style.scrollBehavior = 'auto';
                        window.scrollTo({ top: targetPosition, behavior: 'auto' });
                        window.requestAnimationFrame(function () {
                            document.documentElement.style.scrollBehavior = previousScrollBehavior;
                        });
                        return;
                    }
                    window.scrollTo({ top: targetPosition, behavior: behavior || 'smooth' });
                };

                // Mobile starts with critical CSS. Wait for the complete layout before
                // measuring deep anchors, otherwise the target moves during the scroll.
                if (window.innerWidth <= 768) {
                    var fullStyles = document.querySelector('link[href*="styles.20260727.min.css"]');
                    document.querySelectorAll('.materials-trust, .services, .why-canvas, .gallery, .partner-teaser, .process, .company-stats, .testimonials, .faq, .cta').forEach(function (section) {
                        section.style.contentVisibility = 'visible';
                        section.style.containIntrinsicSize = 'none';
                    });
                    document.documentElement.classList.add('full-styles');
                    if (fullStyles) {
                        fullStyles.rel = 'stylesheet';
                        fullStyles.media = 'all';
                    }
                    // As the browser approaches deferred sections, their real height
                    // replaces the intrinsic placeholder. Re-align until the booking
                    // button is actually inside the viewport.
                    var alignDeepTarget = function (attempt) {
                        scrollToTarget('auto', true);
                        if (attempt >= 30) return;
                        window.setTimeout(function () {
                            var targetRect = target.getBoundingClientRect();
                            var targetIsVisible = targetRect.top >= 16 && targetRect.bottom <= window.innerHeight - 16;
                            if (!targetIsVisible) {
                                alignDeepTarget(attempt + 1);
                            }
                        }, 120);
                    };
                    window.setTimeout(function () { alignDeepTarget(0); }, 450);
                    return;
                }

                scrollToTarget('auto');
            }
        });
    });
}

/* ===================================
   Cal.com Embed Fallback
   =================================== */
function initCalendarFallback() {
    var calendarNamespace = 'canvas-advertising-strategy-meeting';
    var bookingListenerAttached = false;

    document.querySelectorAll('[data-cal-link]').forEach(function (trigger) {
        trigger.addEventListener('click', function () {
            var calLink = trigger.getAttribute('data-cal-link');
            if (!calLink) return;

            sendAnalyticsEvent('calendar_open', {
                calendar: calLink,
                page_path: window.location.pathname,
                trigger_id: trigger.id || 'calendar_cta'
            });

            window.setTimeout(function () {
                var calendarFrame = document.querySelector('iframe[src*="cal.com/"]');
                var calendarModal = document.querySelector('[data-cal-modal], [class*="cal-modal"], [class*="cal-embed"]');
                if (!calendarFrame && !calendarModal) {
                    window.location.href = 'https://cal.com/' + calLink;
                }
            }, 1200);
        });
    });

    // Cal initializes after the first screen is interactive. Attach once its
    // namespaced API is ready and record only confirmed new bookings.
    var attachBookingListener = function (attempt) {
        if (bookingListenerAttached) return;
        var calendarApi = window.Cal && window.Cal.ns && window.Cal.ns[calendarNamespace];
        if (typeof calendarApi === 'function') {
            calendarApi('on', {
                action: 'bookingSuccessfulV2',
                callback: function (event) {
                    var booking = event && event.detail && event.detail.data ? event.detail.data : {};
                    sendAnalyticsEvent('booking_complete', {
                        method: 'cal_com',
                        calendar: calendarNamespace,
                        event_type_id: booking.eventTypeId || '',
                        booking_status: booking.status || 'confirmed',
                        page_path: window.location.pathname
                    });
                }
            });
            bookingListenerAttached = true;
            return;
        }
        if (attempt < 40) {
            window.setTimeout(function () { attachBookingListener(attempt + 1); }, 500);
        }
    };
    attachBookingListener(0);
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

    // Keep one video as the continuous hero background while the four
    // marketing messages continue rotating independently above it.
    var total        = texts.length || slides.length;
    if (total === 0) return;

    var current      = 0;
    var interval     = 6000; // ms per slide
    var timer        = null;
    var staticMobileHero = window.matchMedia('(max-width: 768px), (prefers-reduced-motion: reduce)').matches;
    var isPaused     = staticMobileHero;
    var progressAnim = null; // animation frame id or animation reference

    // ── Go to slide ──────────────────────────────
    function goToSlide(index) {
        // Wrap index
        if (index < 0) index = total - 1;
        if (index >= total) index = 0;
        current = index;

        // Slides
        if (slides.length > 1) {
            slides.forEach(function (s) { s.classList.remove('active'); });
            if (slides[current]) slides[current].classList.add('active');
        } else if (slides[0]) {
            slides[0].classList.add('active');
        }

        // Text
        texts.forEach(function (t) { t.classList.remove('active'); });
        if (texts[current]) {
            texts[current].classList.add('active');
            // Trigger luxury text-split animation for the new slide
            if (typeof animateSlideIn === 'function') {
                animateSlideIn(texts[current]);
            }
        }

        // Steps
        steps.forEach(function (s) { s.classList.remove('active'); });
        if (steps[current]) steps[current].classList.add('active');

        // Restart progress bar
        startProgress();
    }

    // ── Progress bar animation ───────────────────
    function startProgress() {
        if (!progressBar) return;

        if (staticMobileHero) {
            progressBar.style.transition = 'none';
            progressBar.style.width = '100%';
            return;
        }

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
    if (!window.matchMedia('(max-width: 768px), (prefers-reduced-motion: reduce)').matches && typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
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

            // Keep the completed projects already published in the page.
            // Firestore projects are additions to the portfolio, not a replacement.
            var existingImages = new Set(
                Array.from(galleryGrid.querySelectorAll('.gallery__image')).map(function (image) {
                    return image.src;
                })
            );
            var addedProjects = 0;

            snapshot.forEach(function (doc) {
                var project = doc.data();
                var category = project.category || 'print';

                if (!project.featuredImage || existingImages.has(project.featuredImage)) {
                    return;
                }
                
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
                existingImages.add(project.featuredImage);
                addedProjects += 1;
            });

            console.log("Added " + addedProjects + " Firestore projects to the existing portfolio.");
            
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
    function clearSelection() {
        var selection = window.getSelection ? window.getSelection() : null;
        if (selection && selection.removeAllRanges) {
            selection.removeAllRanges();
        }
    }

    document.querySelectorAll('[data-before-after-slider], .before-after__slider').forEach(function (slider) {
        var handle     = slider.querySelector('[data-before-after-handle], .before-after__handle');
        var afterImage = slider.querySelector('.before-after__image--after');

        if (!handle || !afterImage) return;

        var isDragging = false;

        slider.querySelectorAll('img').forEach(function (img) {
            img.setAttribute('draggable', 'false');
            img.addEventListener('dragstart', function (e) {
                e.preventDefault();
            });
        });

        function updateSlider(clientX) {
            var rect     = slider.getBoundingClientRect();
            var position = (clientX - rect.left) / rect.width;
            position     = Math.max(0, Math.min(1, position));

            var percentage = position * 100;
            handle.style.left         = percentage + '%';
            afterImage.style.clipPath = 'inset(0 0 0 ' + percentage + '%)';
        }

        slider.addEventListener('mousedown', function (e) {
            e.preventDefault();
            clearSelection();
            isDragging = true;
            updateSlider(e.clientX);
        });

        document.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            e.preventDefault();
            clearSelection();
            updateSlider(e.clientX);
        });

        document.addEventListener('mouseup', function () {
            isDragging = false;
        });

        slider.addEventListener('touchstart', function (e) {
            e.preventDefault();
            clearSelection();
            isDragging = true;
            updateSlider(e.touches[0].clientX);
        }, { passive: false });

        document.addEventListener('touchmove', function (e) {
            if (!isDragging) return;
            e.preventDefault();
            clearSelection();
            updateSlider(e.touches[0].clientX);
        }, { passive: false });

        document.addEventListener('touchend', function () {
            isDragging = false;
        });
    });

    document.querySelectorAll('[data-before-after-tab]').forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.getAttribute('data-before-after-tab');
            var section = tab.closest('.before-after');
            if (!target || !section) return;

            section.querySelectorAll('[data-before-after-tab]').forEach(function (item) {
                var isActive = item === tab;
                item.classList.toggle('active', isActive);
                item.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            section.querySelectorAll('[data-before-after-project]').forEach(function (project) {
                project.classList.toggle('active', project.getAttribute('data-before-after-project') === target);
            });
        });
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
            await loadFirebaseSdk();
            // Submit to Firebase if available
            if (window.CanvasFirebase && typeof firebase !== 'undefined') {
                await window.CanvasFirebase.submitLead(leadData);
            } else {
                console.log('Lead captured (Firebase not configured):', leadData);
            }

            // Track lead conversion
            sendAnalyticsEvent('generate_lead', { method: 'contact_form', currency: 'USD', value: 0.00 }, 'Lead', { content_category: 'Contact Form', value: 0.00, currency: 'USD' });

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
            await loadFirebaseSdk();
            // 1. Submit to Firebase (CRM)
            if (window.CanvasFirebase) {
                await window.CanvasFirebase.submitLead(leadData);
            } else {
                console.log('Firebase not initialized, logging lead:', leadData);
            }

            // Track analytics lead event
            sendAnalyticsEvent('generate_lead', { method: 'whatsapp_widget', currency: 'USD', value: 0.00 }, 'Lead', { content_category: 'WhatsApp Widget', value: 0.00, currency: 'USD' });

            // 2. Show Success
            if (successMsg) successMsg.style.display = 'flex';

            // 3. Redirect to WhatsApp after delay
            setTimeout(function () {
                var phoneNumber = lang.indexOf('es') === 0 ? '15129459783' : '15124343793';
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
            var fallbackPhoneNumber = lang.indexOf('es') === 0 ? '15129459783' : '15124343793';
            window.open('https://wa.me/' + fallbackPhoneNumber, '_blank');
            submitBtn.disabled  = false;
            submitBtn.innerHTML = originalContent;
        }
    });
}


/* ==========================================================================
   LUXURY PREMIUM EFFECTS — GSAP-Powered (Zero External Dependencies)
   ========================================================================== */

/* --- Hero Title Text-Split Animation ---
   Splits each hero title into individual characters, then animates them
   with a cinematic 3D rotation reveal. Called once at init; the hero
   carousel re-triggers animation on each slide change.
   ------------------------------------------------------------------- */
function initHeroTextSplit() {
    var titles = document.querySelectorAll('.hero-cinema__title[data-split]');
    if (titles.length === 0) return;

    if (window.matchMedia('(max-width: 768px), (prefers-reduced-motion: reduce)').matches) {
        var activeText = document.querySelector('.hero-cinema__text.active');
        if (activeText) animateSlideIn(activeText);
        return;
    }

    titles.forEach(function (title) {
        // Preserve original HTML for carousel re-triggering
        title.setAttribute('data-original-html', title.innerHTML);
        splitTitleIntoChars(title);
    });

    // Animate the initially active slide's title
    var activeText = document.querySelector('.hero-cinema__text.active');
    if (activeText) {
        animateSlideIn(activeText);
    }
}

function splitTitleIntoChars(title) {
    var html = title.getAttribute('data-original-html') || title.innerHTML;
    var result = '';
    var charIndex = 0;

    // Process HTML preserving <br> tags
    var parts = html.split(/(<br\s*\/?>)/gi);
    parts.forEach(function (part) {
        if (part.match(/^<br\s*\/?>$/i)) {
            result += part;
        } else {
            // Split part into words by spaces, preserve spaces
            var words = part.split(' ');
            var wordSpans = words.map(function (word) {
                if (word.length === 0) return '';
                var wordHtml = '<span class="word">';
                for (var i = 0; i < word.length; i++) {
                    var ch = word[i];
                    wordHtml += '<span class="char" style="transition-delay:' + (charIndex * 0.03) + 's">' + ch + '</span>';
                    charIndex++;
                }
                wordHtml += '</span>';
                return wordHtml;
            });
            result += wordSpans.join(' ');
        }
    });

    title.innerHTML = result;
}

function animateSlideIn(textBlock) {
    if (!textBlock) return;

    var title = textBlock.querySelector('.hero-cinema__title');
    var desc = textBlock.querySelector('.hero-cinema__desc');
    var btn = textBlock.querySelector('.hero-cinema__btn');
    var lineEl = textBlock.querySelector('.hero-cinema__line-element');

    // Re-split in case carousel cycled
    if (title && title.getAttribute('data-original-html')) {
        splitTitleIntoChars(title);
    }

    // Animate characters with staggered 3D rotation
    if (title) {
        var chars = title.querySelectorAll('.char');
        requestAnimationFrame(function () {
            chars.forEach(function (ch) {
                ch.classList.add('animated');
            });
        });
    }

    // Animate description and button with GSAP
    if (typeof gsap !== 'undefined') {
        if (lineEl) {
            gsap.fromTo(lineEl, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.1, ease: 'power3.out' });
        }
        if (desc) {
            gsap.fromTo(desc, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, delay: 0.4, ease: 'power3.out' });
        }
        if (btn) {
            gsap.fromTo(btn, { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, delay: 0.6, ease: 'back.out(1.4)' });
        }
    }
}

/* --- Magnetic Hover Buttons ---
   CTAs gently attract toward cursor position on hover.
   ------------------------------------------------------------------- */
function initMagneticButtons() {
    // Only on devices with a fine pointer (not touch)
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var buttons = document.querySelectorAll('.hero-cinema__btn, .btn--primary, .btn--accent');

    buttons.forEach(function (btn) {
        btn.addEventListener('mousemove', function (e) {
            var rect = btn.getBoundingClientRect();
            var x = e.clientX - rect.left - rect.width / 2;
            var y = e.clientY - rect.top - rect.height / 2;

            // Magnetic pull strength (pixels)
            var strength = 0.3;

            if (typeof gsap !== 'undefined') {
                gsap.to(btn, {
                    x: x * strength,
                    y: y * strength,
                    duration: 0.3,
                    ease: 'power2.out'
                });
            }
        });

        btn.addEventListener('mouseleave', function () {
            if (typeof gsap !== 'undefined') {
                gsap.to(btn, {
                    x: 0,
                    y: 0,
                    duration: 0.5,
                    ease: 'elastic.out(1, 0.4)'
                });
            }
        });
    });
}

/* --- Hero Parallax on Scroll ---
   Active hero slide image shifts slightly on scroll for depth.
   ------------------------------------------------------------------- */
function initHeroParallax() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    if (window.matchMedia('(max-width: 768px), (prefers-reduced-motion: reduce)').matches) return;

    var heroSection = document.getElementById('hero');
    if (!heroSection) return;

    // Parallax the active slide background
    gsap.to('.hero-cinema__slide.active', {
        yPercent: 15,
        ease: 'none',
        scrollTrigger: {
            trigger: heroSection,
            start: 'top top',
            end: 'bottom top',
            scrub: true
        }
    });

    // Fade the hero content slightly on scroll
    gsap.to('.hero-cinema__content', {
        opacity: 0.3,
        y: -60,
        ease: 'none',
        scrollTrigger: {
            trigger: heroSection,
            start: 'top top',
            end: '70% top',
            scrub: true
        }
    });
}

/* --- Hero Parallax on Mouse Move ---
   Active hero slide background and text layers react to cursor position.
   ------------------------------------------------------------------- */
function initHeroMouseMoveParallax() {
    if (typeof gsap === 'undefined') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var heroSection = document.getElementById('hero');
    if (!heroSection) return;

    heroSection.addEventListener('mousemove', function (e) {
        var rect = heroSection.getBoundingClientRect();
        var relX = (e.clientX - rect.left) / rect.width - 0.5; // range: -0.5 to 0.5
        var relY = (e.clientY - rect.top) / rect.height - 0.5; // range: -0.5 to 0.5

        // Background moves slightly in opposite direction of mouse
        gsap.to('.hero-cinema__slide.active', {
            x: relX * -25,
            y: relY * -25,
            duration: 0.8,
            ease: 'power2.out',
            overwrite: 'auto'
        });

        // Content moves in same direction of mouse for parallax separation
        gsap.to('.hero-cinema__content', {
            x: relX * 20,
            y: relY * 20,
            duration: 0.8,
            ease: 'power2.out',
            overwrite: 'auto'
        });
    });

    heroSection.addEventListener('mouseleave', function () {
        gsap.to('.hero-cinema__slide.active', {
            x: 0,
            y: 0,
            duration: 1,
            ease: 'power2.out',
            overwrite: 'auto'
        });
        gsap.to('.hero-cinema__content', {
            x: 0,
            y: 0,
            duration: 1,
            ease: 'power2.out',
            overwrite: 'auto'
        });
    });
}

/* --- Animated Stat Counters ---
   Numbers count up from 0 when they scroll into view.
   ------------------------------------------------------------------- */
function initStatCounters() {
    var statNumbers = document.querySelectorAll('.stat-card__number');
    if (statNumbers.length === 0 || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    statNumbers.forEach(function (el) {
        var text = el.textContent.trim();
        // Extract the numeric part and suffix (e.g., "500+" → 500, "+")
        var match = text.match(/^([\d,]+)(.*)/);
        if (!match) return;

        var targetNum = parseInt(match[1].replace(/,/g, ''), 10);
        var suffix = match[2] || '';

        // Store original for safety
        el.setAttribute('data-target', targetNum);
        el.setAttribute('data-suffix', suffix);

        ScrollTrigger.create({
            trigger: el,
            start: 'top 85%',
            once: true,
            onEnter: function () {
                var obj = { val: 0 };
                gsap.to(obj, {
                    val: targetNum,
                    duration: 2,
                    ease: 'power2.out',
                    onUpdate: function () {
                        el.textContent = Math.round(obj.val).toLocaleString() + suffix;
                    }
                });
            }
        });
    });
}

/* --- Card 3D Tilt & Glare Mouse listener --- */
function init3DTilt() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    function setupTiltListeners() {
        var cards = document.querySelectorAll('.service-card, .why-item, .stat-card, .testimonial, .gallery__item, .materials-trust__card');

        cards.forEach(function (card) {
            // Remove previous to avoid duplicates
            card.removeEventListener('mousemove', onCardMouseMove);
            card.removeEventListener('mouseleave', onCardMouseLeave);

            card.addEventListener('mousemove', onCardMouseMove);
            card.addEventListener('mouseleave', onCardMouseLeave);
        });
    }

    function onCardMouseMove(e) {
        var card = this;
        var rect = card.getBoundingClientRect();
        
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        var xc = x / rect.width - 0.5;
        var yc = y / rect.height - 0.5;

        var maxRot = 10; // degrees

        var rx = -yc * maxRot;
        var ry = xc * maxRot;

        card.style.setProperty('--rx', rx + 'deg');
        card.style.setProperty('--ry', ry + 'deg');
        card.style.setProperty('--mx', (x / rect.width) * 100 + '%');
        card.style.setProperty('--my', (y / rect.height) * 100 + '%');
    }

    function onCardMouseLeave() {
        var card = this;
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
    }

    setupTiltListeners();

    // Re-apply on dynamic elements (dynamic gallery items)
    var galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        var observer = new MutationObserver(setupTiltListeners);
        observer.observe(galleryGrid, { childList: true });
    }
}



/* ===================================
   Portfolio Masonry Filters
   =================================== */
function initPortfolioFilters() {
    var filterButtons = document.querySelectorAll('.portfolio__filter');
    var portfolioGrid = document.getElementById('portfolioMasonry');
    if (!portfolioGrid) return;

    var portfolioItems = portfolioGrid.querySelectorAll('.portfolio__item');

    filterButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            var filter = this.dataset.filter;

            // Update active button
            filterButtons.forEach(function (btn) { btn.classList.remove('active'); });
            this.classList.add('active');

            // Filter items
            portfolioItems.forEach(function (item) {
                var category = item.dataset.category;

                if (filter === 'all' || category === filter) {
                    item.classList.remove('hide');
                    item.style.opacity = '0';
                    item.style.transform = 'scale(0.9)';

                    // Animate in
                    setTimeout(function () {
                        item.style.opacity = '1';
                        item.style.transform = 'translateZ(0) scale(1)';
                    }, 50);
                } else {
                    item.style.opacity = '0';
                    item.style.transform = 'scale(0.9)';

                    setTimeout(function () {
                        item.classList.add('hide');
                    }, 400); // Wait for transition
                }
            });
        });
    });
}

/* ===================================
   Quote Estimator Logic
   =================================== */
function initQuoteEstimator() {
    var form = document.getElementById('estimatorForm');
    if (!form) return;

    var calcMethods = document.getElementsByName('calcMethod');
    var stepVehicle = document.getElementById('stepVehicle');
    var stepCustom = document.getElementById('stepCustom');
    
    var vehicleSizeInput = document.getElementById('vehicleSize');
    var wrapCoverageInput = document.getElementById('wrapCoverage');
    var wrapFinishInput = document.getElementById('wrapFinish');
    var livePriceVal = document.getElementById('livePrice');
    var liveDurationVal = document.getElementById('liveDuration');
    var fleetDiscountBadge = document.getElementById('fleetDiscountBadge');
    var liveChecklist = document.getElementById('liveChecklist');
    var projectTypeInput = document.getElementById('projectType');
    var materialTypeInput = document.getElementById('materialType');
    var finishTypeInput = document.getElementById('finishType');
    var deliveryMethodInput = document.getElementById('deliveryMethod');
    var quantityInput = document.getElementById('quantity');
    var productionNotesInput = document.getElementById('productionNotes');
    var productionIntakeHint = document.getElementById('productionIntakeHint');

    var vehicleCards = document.querySelectorAll('.vehicle-card');
    var coverageCards = document.querySelectorAll('.coverage-card');
    var finishCards = document.querySelectorAll('.finish-card');

    var foodTruckSizeContainer = document.getElementById('foodTruckSizeContainer');
    var isSpanish = document.documentElement.lang === 'es';
    var quoteParams = new URLSearchParams(window.location.search);

    var projectPresets = {
        'wrap-panels': {
            material: 'laminated-wrap-film',
            finish: 'print-cut-laminate',
            method: 'vehicle',
            quantityPlaceholder: isSpanish ? 'ej. 4 paneles, 120 ft²' : 'e.g. 4 panels, 120 sq ft',
            notesPlaceholder: isSpanish ? 'Vehículo, paneles, material, laminado, marcas de corte, empaque y entrega.' : 'Vehicle, panels, material, laminate, cut marks, packaging, and delivery.',
            hint: isSpanish ? '<strong>Mejor opción:</strong> Paneles de wrap listos para instalar.<span>Envíe arte, plantilla, tamaño de paneles, laminado, fecha límite y preferencia de envío o entrega local.</span>' : '<strong>Best fit:</strong> Installer-ready wrap panels.<span>Send artwork, template, panel sizes, laminate, deadline, and shipping or local delivery preference.</span>'
        },
        'wholesale-vinyl': {
            material: 'printed-vinyl',
            finish: 'print-cut-laminate',
            method: 'custom',
            quantityPlaceholder: isSpanish ? 'ej. 10 paneles, 250 ft²' : 'e.g. 10 panels, 250 sq ft',
            notesPlaceholder: isSpanish ? 'Material, rollos/paneles, laminado, corte, empaque blanco y dirección de envío.' : 'Material, rolls/panels, laminate, cutting, white-label packaging, and ship-to address.',
            hint: isSpanish ? '<strong>Mayoreo:</strong> Producción de vinil para tiendas, instaladores y marcas.<span>Ideal para archivos listos, empaque sin marca, recogida, entrega local o envío.</span>' : '<strong>Wholesale:</strong> Vinyl production for shops, installers, and brands.<span>Best for ready files, white-label packaging, pickup, local delivery, or shipping.</span>'
        },
        'contour-cut-decals': {
            material: 'printed-vinyl',
            finish: 'contour-cut',
            method: 'custom',
            quantityPlaceholder: isSpanish ? 'ej. 200 calcomanías de 4 pulgadas' : 'e.g. 200 decals at 4 inches',
            notesPlaceholder: isSpanish ? 'Tamaño, cantidad, laminado, corte, sangrado, máscara de transferencia y empaque.' : 'Size, quantity, laminate, cut path, bleed, transfer mask, and packaging.',
            hint: isSpanish ? '<strong>Calcomanías:</strong> Para logos, flotillas, etiquetas y ventanas.<span>Suba archivo vectorial si lo tiene; también podemos revisar el corte.</span>' : '<strong>Decals:</strong> For logos, fleets, labels, and windows.<span>Upload vector artwork if available; we can review cut paths too.</span>'
        },
        'replacement-panels': {
            material: 'laminated-wrap-film',
            finish: 'matte-laminate',
            method: 'vehicle',
            quantityPlaceholder: isSpanish ? 'ej. panel puerta izquierda, 32 x 68 in' : 'e.g. left door panel, 32 x 68 in',
            notesPlaceholder: isSpanish ? 'Panel dañado, lado del vehículo, tamaño, material original y foto para igualar.' : 'Damaged panel, vehicle side, size, original material, and match photo.',
            hint: isSpanish ? '<strong>Reimpresión:</strong> Para reemplazar paneles dañados o actualizar flotillas.<span>Envíe fotos, medidas y archivo original si lo tiene.</span>' : '<strong>Reprint:</strong> For damaged wrap panels or fleet refreshes.<span>Send photos, measurements, and original art if you have it.</span>'
        },
        'perforated-window-vinyl': {
            material: 'perforated-window-vinyl',
            finish: 'print-cut-laminate',
            method: 'custom',
            quantityPlaceholder: isSpanish ? 'ej. 3 ventanas, 48 x 72 in cada una' : 'e.g. 3 windows, 48 x 72 in each',
            notesPlaceholder: isSpanish ? 'Medidas de vidrio, cantidad, interior/exterior, entrega local o envío, y fotos del storefront.' : 'Glass measurements, quantity, interior/exterior, local delivery or shipping, and storefront photos.',
            hint: isSpanish ? '<strong>Vinil perforado:</strong> Para ventanas de storefront, vidrio comercial y ventanas de vehículos.<span>Envíe medidas exactas del vidrio y fotos de cada ventana.</span>' : '<strong>Perforated vinyl:</strong> For storefront windows, retail glass, and vehicle windows.<span>Send exact glass measurements and photos of each window.</span>'
        },
        'window-graphics': {
            material: 'printed-vinyl',
            finish: 'contour-cut',
            method: 'custom',
            quantityPlaceholder: isSpanish ? 'ej. logo puerta + horarios' : 'e.g. door logo + store hours',
            notesPlaceholder: isSpanish ? 'Tamaño de logos, horarios, vinil impreso o cortado, color y fotos del vidrio.' : 'Logo size, store hours, printed or cut vinyl, color, and glass photos.',
            hint: isSpanish ? '<strong>Ventanas:</strong> Logos, horarios, puertas y promociones.<span>Ideal para vinil cortado, impreso o removible.</span>' : '<strong>Windows:</strong> Logos, hours, doors, and promotions.<span>Good for cut vinyl, printed vinyl, or removable graphics.</span>'
        },
        'wall-murals': {
            material: 'wall-mural-vinyl',
            finish: 'matte-laminate',
            method: 'custom',
            quantityPlaceholder: isSpanish ? 'ej. pared 12 ft x 8 ft' : 'e.g. wall 12 ft x 8 ft',
            notesPlaceholder: isSpanish ? 'Medidas de pared, textura, interior/exterior, paneles, entrega o envío.' : 'Wall size, texture, indoor/outdoor, panels, delivery or shipping.',
            hint: isSpanish ? '<strong>Murales:</strong> Paneles impresos para paredes interiores o retail.<span>Incluya medidas, textura y fotos de la pared.</span>' : '<strong>Murals:</strong> Printed panels for interior or retail walls.<span>Include measurements, wall texture, and photos.</span>'
        },
        'vinyl-banners': {
            material: 'banner-vinyl',
            finish: 'no-laminate',
            method: 'custom',
            quantityPlaceholder: isSpanish ? 'ej. 2 banners, 3 x 8 ft' : 'e.g. 2 banners, 3 x 8 ft',
            notesPlaceholder: isSpanish ? 'Tamaño, cantidad, dobladillo, ojillos, interior/exterior y fecha límite.' : 'Size, quantity, hems, grommets, indoor/outdoor, and deadline.',
            hint: isSpanish ? '<strong>Banners:</strong> Señal temporal o eventos.<span>Envíe tamaño final, cantidad y acabado.</span>' : '<strong>Banners:</strong> Temporary signage or event graphics.<span>Send final size, quantity, and finishing needs.</span>'
        },
        'fleet-graphics': {
            material: 'laminated-wrap-film',
            finish: 'print-cut-laminate',
            method: 'vehicle',
            quantityPlaceholder: isSpanish ? 'ej. 6 vans, 2 lados + parte trasera' : 'e.g. 6 vans, 2 sides + rear',
            notesPlaceholder: isSpanish ? 'Cantidad de vehículos, modelo, paneles, repetición, envío por ubicación.' : 'Vehicle count, model, panels, repeat orders, shipping by location.',
            hint: isSpanish ? '<strong>Flotillas:</strong> Producción repetible para múltiples vehículos.<span>Podemos empacar por vehículo o ubicación.</span>' : '<strong>Fleets:</strong> Repeatable production for multiple vehicles.<span>We can package by vehicle or location.</span>'
        },
        'ricoh-print': {
            material: 'ricoh-paper-stock',
            finish: 'no-laminate',
            method: 'custom',
            quantityPlaceholder: isSpanish ? 'ej. 500 tarjetas, 250 flyers' : 'e.g. 500 business cards, 250 flyers',
            notesPlaceholder: isSpanish ? 'Tamaño, tipo de papel, una/dos caras, cantidad y fecha límite.' : 'Size, paper stock, one/two-sided, quantity, and deadline.',
            hint: isSpanish ? '<strong>Ricoh secundario:</strong> Flyers, tarjetas, menús e inserts para apoyar trabajos de vinil.<span>El enfoque principal sigue siendo producción de vinil.</span>' : '<strong>Secondary Ricoh:</strong> Flyers, cards, menus, and inserts to support vinyl jobs.<span>The primary focus remains vinyl production.</span>'
        }
    };

    // Service pages can open the estimator with the relevant production setup ready.
    var requestedProject = quoteParams.get('product') || quoteParams.get('project');
    if (requestedProject && projectPresets[requestedProject] && projectTypeInput) {
        projectTypeInput.value = requestedProject;
        sendAnalyticsEvent('quote_prefill', {
            product: requestedProject,
            source_page: quoteParams.get('source') || document.referrer || 'direct'
        }, 'Lead', { content_category: 'Smart Quote' });
    }

    var requestedDelivery = quoteParams.get('delivery');
    if (requestedDelivery && deliveryMethodInput && Array.prototype.some.call(deliveryMethodInput.options, function(option) {
        return option.value === requestedDelivery;
    })) {
        deliveryMethodInput.value = requestedDelivery;
    }

    function getEstimatedCostRange() {
        var method = document.querySelector('input[name="calcMethod"]:checked').value;
        var coverage = parseFloat(wrapCoverageInput.value);
        var baseSqFt = 0;

        if (method === 'vehicle') {
            baseSqFt = parseFloat(vehicleSizeInput.value);
        } else {
            var width = parseFloat(document.getElementById('customWidth').value) || 0;
            var height = parseFloat(document.getElementById('customHeight').value) || 0;
            baseSqFt = (width * height) / 144;
        }

        // Apply finish multipliers
        var finishType = wrapFinishInput ? wrapFinishInput.value : 'printed';
        var multiplier = 1.0;
        if (finishType === 'solid') {
            multiplier = 1.15;
        } else if (finishType === 'specialty') {
            multiplier = 1.45;
        }

        var totalSqFt = baseSqFt * coverage;
        var low = Math.round(totalSqFt * 15 * multiplier);
        var high = Math.round(totalSqFt * 20 * multiplier);

        // Adjust for full wraps minimum ($3,500 - $4,200) before multiplier is applied,
        // or apply it to the base minimum.
        if (coverage === 1.0) {
            var baseLow = Math.round(totalSqFt * 15);
            var baseHigh = Math.round(totalSqFt * 20);
            if (baseLow < 3500) baseLow = 3500;
            if (baseHigh < 4200) baseHigh = 4200;

            low = Math.round(baseLow * multiplier);
            high = Math.round(baseHigh * multiplier);
        }

        return { low: low, high: high };
    }

    // 2. Animated Live Price Counter (GSAP)
    var currentDisplayPrice = { low: 1875, high: 2500 };
    var currencyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    });

    function updateLiveDetails() {
        var coverage = parseFloat(wrapCoverageInput.value);
        var activeVehicleCard = document.querySelector('.vehicle-card.active');
        var vehicleType = activeVehicleCard ? activeVehicleCard.getAttribute('data-vehicle') : '';

        // 1. Duration text
        var durationText = '';
        if (isSpanish) {
            if (coverage === 0.25) {
                durationText = '1 - 2 Días Hábiles (Diseño e Impresión)';
            } else if (coverage === 0.5) {
                durationText = '2 - 3 Días Hábiles (Producción y Empaque)';
            } else {
                durationText = '3 - 5+ Días Hábiles (Producción Personalizada)';
            }
        } else {
            if (coverage === 0.25) {
                durationText = '1 - 2 Business Days (Design & Print)';
            } else if (coverage === 0.5) {
                durationText = '2 - 3 Business Days (Production & Packaging)';
            } else {
                durationText = '3 - 5+ Business Days (Full Custom Production)';
            }
        }

        if (liveDurationVal && liveDurationVal.querySelector('span')) {
            liveDurationVal.querySelector('span').textContent = durationText;
        }

        // 2. Fleet discount badge visibility
        var method = document.querySelector('input[name="calcMethod"]:checked').value;
        if (method === 'vehicle' && (vehicleType === 'boxtruck' || vehicleType === 'foodtruck' || vehicleType === 'van')) {
            if (fleetDiscountBadge) fleetDiscountBadge.style.display = 'block';
        } else {
            if (fleetDiscountBadge) fleetDiscountBadge.style.display = 'none';
        }

        // 3. Dynamic Checklist
        if (liveChecklist) {
            var checklistHTML = '';
            var checkSVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" style="color: #4CAF50; flex-shrink: 0;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            
            if (isSpanish) {
                if (coverage === 0.25) {
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Pruebas de Diseño Personalizado</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Impresión Premium HP Latex</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Laminado con Protección UV</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Logos y Letras Cortados</li>';
                } else if (coverage === 0.5) {
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Pruebas de Diseño Personalizado</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Impresión Premium HP Latex</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Laminado con Protección UV</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Paneles Laterales y Traseros Listos para Instalar</li>';
                } else {
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Diseño Gráfico 100% Personalizado</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Producción de Impresión HP Latex</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Laminado Fundido Premium 3M/Avery</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Paneles Completos Listos para Instalar</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Empaque para Recoger, Entrega Local o Envío</li>';
                }
            } else {
                if (coverage === 0.25) {
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Custom Design Proofs</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'HP Latex Premium Printing</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'UV Protection Lamination</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Die-Cut Spots & Lettering Graphics</li>';
                } else if (coverage === 0.5) {
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Custom Design Proofs</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'HP Latex Premium Printing</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'UV Protection Lamination</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Installer-Ready Sides & Rear Graphics</li>';
                } else {
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + '100% Custom Graphic Design</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'HP Latex Premium Print Production</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + '3M/Avery Premium Cast Lamination</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Installer-Ready Full Panel Set</li>';
                    checklistHTML += '<li class="live-quote-card__checklist-item">' + checkSVG + 'Packaged for Pickup, Local Delivery, or Shipping</li>';
                }
            }
            liveChecklist.innerHTML = checklistHTML;
        }
    }

    function updateLivePrice(animate) {
        var priceRange = getEstimatedCostRange();
        if (animate && typeof gsap !== 'undefined') {
            gsap.to(currentDisplayPrice, {
                low: priceRange.low,
                high: priceRange.high,
                duration: 0.6,
                ease: 'power2.out',
                onUpdate: function() {
                    if (livePriceVal) {
                        livePriceVal.textContent = currencyFormatter.format(Math.round(currentDisplayPrice.low)) + 
                            ' - ' + currencyFormatter.format(Math.round(currentDisplayPrice.high));
                    }
                }
            });
        } else {
            currentDisplayPrice.low = priceRange.low;
            currentDisplayPrice.high = priceRange.high;
            if (livePriceVal) {
                livePriceVal.textContent = currencyFormatter.format(priceRange.low) + ' - ' + currencyFormatter.format(priceRange.high);
            }
        }

        // Update turnaround duration, B2B discount warning, and checklist
        updateLiveDetails();

        // Also update SVG visual fills based on active selections
        updateVisualSilhouettes();
    }

    function setCalcMethod(method) {
        var target = document.querySelector('input[name="calcMethod"][value="' + method + '"]');
        if (target) {
            target.checked = true;
            if (method === 'vehicle') {
                stepVehicle.style.display = 'block';
                stepCustom.style.display = 'none';
            } else {
                stepVehicle.style.display = 'none';
                stepCustom.style.display = 'block';
                if (foodTruckSizeContainer) foodTruckSizeContainer.style.display = 'none';
            }
        }
    }

    function applyProjectPreset() {
        if (!projectTypeInput) return;
        var preset = projectPresets[projectTypeInput.value];
        if (!preset) return;

        if (materialTypeInput) materialTypeInput.value = preset.material;
        if (finishTypeInput) finishTypeInput.value = preset.finish;
        if (quantityInput) quantityInput.placeholder = preset.quantityPlaceholder;
        if (productionNotesInput) productionNotesInput.placeholder = preset.notesPlaceholder;
        if (deliveryMethodInput && projectTypeInput.value === 'ricoh-print') {
            deliveryMethodInput.value = 'pickup-austin';
        }
        if (productionIntakeHint) {
            productionIntakeHint.innerHTML = preset.hint;
        }
        setCalcMethod(preset.method);
        updateLivePrice(true);
    }

    // 3. Update Visual SVG Silhouettes (Linear Gradients)
    function updateVisualSilhouettes() {
        if (typeof gsap === 'undefined') return;

        var coverage = parseFloat(wrapCoverageInput.value);
        var percentage = coverage * 100; // e.g. 25%, 50%, 100%

        // Loop through all vehicle cards
        vehicleCards.forEach(function(card) {
            var vehicleType = card.getAttribute('data-vehicle');
            var gradId = 'wrapGrad-' + vehicleType;
            var stops = document.querySelectorAll('#' + gradId + ' stop');

            if (stops.length >= 3) {
                var isSelectedCard = card.classList.contains('active');
                
                // If it is the selected card, animate the red fill to match the coverage %
                // Otherwise, keep it fully uncolored (0% red, 100% grey)
                var targetOffset = isSelectedCard ? percentage : 0;

                gsap.to(stops[0], {
                    attr: { offset: targetOffset + '%' },
                    duration: 0.5,
                    ease: 'power2.out'
                });
                gsap.to(stops[1], {
                    attr: { offset: targetOffset + '%' },
                    duration: 0.5,
                    ease: 'power2.out'
                });
                gsap.to(stops[2], {
                    attr: { offset: targetOffset + '%' },
                    duration: 0.5,
                    ease: 'power2.out'
                });
            }
        });
    }

    // 4. Set up interactive grid event listeners
    vehicleCards.forEach(function(card) {
        card.addEventListener('click', function() {
            vehicleCards.forEach(function(c) { c.classList.remove('active'); });
            this.classList.add('active');
            
            var vehicleType = this.getAttribute('data-vehicle');
            if (vehicleType === 'foodtruck') {
                if (foodTruckSizeContainer) {
                    foodTruckSizeContainer.style.display = 'block';
                    var activeSizeBtn = foodTruckSizeContainer.querySelector('.ft-size-btn.active');
                    if (activeSizeBtn) {
                        vehicleSizeInput.value = activeSizeBtn.getAttribute('data-sqft');
                    } else {
                        vehicleSizeInput.value = '500';
                    }
                } else {
                    vehicleSizeInput.value = this.getAttribute('data-value');
                }
            } else {
                if (foodTruckSizeContainer) foodTruckSizeContainer.style.display = 'none';
                vehicleSizeInput.value = this.getAttribute('data-value');
            }
            updateLivePrice(true);
        });
    });

    // Food Truck size buttons click handler
    if (foodTruckSizeContainer) {
        var ftSizeButtons = foodTruckSizeContainer.querySelectorAll('.ft-size-btn');
        ftSizeButtons.forEach(function(btn) {
            btn.addEventListener('click', function() {
                ftSizeButtons.forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                vehicleSizeInput.value = this.getAttribute('data-sqft');
                updateLivePrice(true);
            });
        });
    }

    coverageCards.forEach(function(card) {
        card.addEventListener('click', function() {
            coverageCards.forEach(function(c) { c.classList.remove('active'); });
            this.classList.add('active');
            wrapCoverageInput.value = this.getAttribute('data-value');
            updateLivePrice(true);
        });
    });

    if (finishCards.length > 0) {
        finishCards.forEach(function(card) {
            card.addEventListener('click', function() {
                finishCards.forEach(function(c) { c.classList.remove('active'); });
                this.classList.add('active');
                if (wrapFinishInput) {
                    wrapFinishInput.value = this.getAttribute('data-value');
                }
                updateLivePrice(true);
            });
        });
    }

    // Custom dimensions inputs listeners
    var customWidthInput = document.getElementById('customWidth');
    var customHeightInput = document.getElementById('customHeight');
    if (customWidthInput) customWidthInput.addEventListener('input', function() { updateLivePrice(true); });
    if (customHeightInput) customHeightInput.addEventListener('input', function() { updateLivePrice(true); });
    if (projectTypeInput) projectTypeInput.addEventListener('change', applyProjectPreset);

    // Toggle Calculation Method
    calcMethods.forEach(function(radio) {
        radio.addEventListener('change', function() {
            if (this.value === 'vehicle') {
                stepVehicle.style.display = 'block';
                stepCustom.style.display = 'none';
                // Reset food truck selector display if needed
                var activeVehicleCard = document.querySelector('.vehicle-card.active');
                if (activeVehicleCard && activeVehicleCard.getAttribute('data-vehicle') === 'foodtruck') {
                    if (foodTruckSizeContainer) foodTruckSizeContainer.style.display = 'block';
                }
            } else {
                stepVehicle.style.display = 'none';
                stepCustom.style.display = 'block';
                if (foodTruckSizeContainer) foodTruckSizeContainer.style.display = 'none';
            }
            updateLivePrice(true);
        });
    });

    // Initialize values on load
    applyProjectPreset();
    updateLivePrice(false);

    // Handle Form Submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        var productionFilesInput = document.getElementById('productionFiles');
        var selectedFiles = productionFilesInput ? Array.prototype.slice.call(productionFilesInput.files || []) : [];
        var maxQuoteFileSize = 20 * 1024 * 1024;
        var oversizedFile = selectedFiles.find(function(file) {
            return file.size > maxQuoteFileSize;
        });

        if (oversizedFile) {
            alert((isSpanish ? 'El archivo es mayor de 20 MB: ' : 'File is over 20 MB: ') + oversizedFile.name);
            productionFilesInput.focus();
            return;
        }
        
        var finalRange = getEstimatedCostRange();

        // Display Result
        var resultDiv = document.getElementById('estimatorResult');
        var priceElement = document.getElementById('finalPrice');

        // Hide form fields and show result
        form.style.display = 'none';
        resultDiv.style.display = 'block';
        
        // Count up animation for final result page
        var startVal = { low: 0, high: 0 };
        if (typeof gsap !== 'undefined') {
            gsap.to(startVal, {
                low: finalRange.low,
                high: finalRange.high,
                duration: 1.5,
                ease: 'power3.out',
                onUpdate: function() {
                    priceElement.innerText = currencyFormatter.format(Math.round(startVal.low)) + 
                        ' - ' + currencyFormatter.format(Math.round(startVal.high));
                }
            });
        } else {
            priceElement.innerText = currencyFormatter.format(finalRange.low) + ' - ' + currencyFormatter.format(finalRange.high);
        }

        function selectedText(id) {
            var field = document.getElementById(id);
            if (!field || !field.options || field.selectedIndex < 0) return '';
            return field.options[field.selectedIndex].text;
        }

        // Capture data and log
        var payload = {
            name: document.getElementById('estName').value,
            email: document.getElementById('estEmail').value,
            phone: document.getElementById('estPhone').value,
            service: 'Vinyl Print Production',
            source: 'production_quote_estimator',
            formType: 'production_quote',
            page: window.location.pathname,
            referrer: document.referrer || '',
            landingProduct: requestedProject || '',
            sourcePage: quoteParams.get('source') || '',
            campaignSource: quoteParams.get('utm_source') || '',
            campaignMedium: quoteParams.get('utm_medium') || '',
            campaignName: quoteParams.get('utm_campaign') || '',
            projectType: document.getElementById('projectType') ? document.getElementById('projectType').value : 'wrap-panels',
            projectTypeLabel: selectedText('projectType'),
            materialType: document.getElementById('materialType') ? document.getElementById('materialType').value : '',
            materialTypeLabel: selectedText('materialType'),
            finishType: document.getElementById('finishType') ? document.getElementById('finishType').value : '',
            finishTypeLabel: selectedText('finishType'),
            quantity: document.getElementById('quantity') ? document.getElementById('quantity').value : '',
            deadline: document.getElementById('deadline') ? document.getElementById('deadline').value : '',
            deliveryMethod: document.getElementById('deliveryMethod') ? document.getElementById('deliveryMethod').value : '',
            deliveryMethodLabel: selectedText('deliveryMethod'),
            productionNotes: document.getElementById('productionNotes') ? document.getElementById('productionNotes').value : '',
            selectedFileNames: selectedFiles.map(function(file) { return file.name; }),
            estimatedPrice: currencyFormatter.format(finalRange.low) + ' - ' + currencyFormatter.format(finalRange.high),
            method: document.querySelector('input[name="calcMethod"]:checked').value,
            coverage: wrapCoverageInput.value,
            vehicleSize: vehicleSizeInput.value,
            wrapFinish: wrapFinishInput ? wrapFinishInput.value : 'printed',
            customWidth: document.getElementById('customWidth') ? document.getElementById('customWidth').value : '',
            customHeight: document.getElementById('customHeight') ? document.getElementById('customHeight').value : ''
        };

        payload.productionSummary = [
            payload.projectTypeLabel,
            payload.materialTypeLabel,
            payload.finishTypeLabel,
            payload.quantity,
            payload.deadline,
            payload.deliveryMethodLabel
        ].filter(Boolean).join(' | ');

        console.log("Lead captured:", payload);

        // Track analytics lead event
        sendAnalyticsEvent('generate_lead', { method: 'quote_estimator', currency: 'USD', value: 0.00 }, 'Lead', { content_category: 'Quote Estimator', value: 0.00, currency: 'USD' });

        // Firestore lead submission
        var addLead = window.CanvasFirebase && (window.CanvasFirebase.addLead || window.CanvasFirebase.submitLead);
        var uploadLeadFiles = window.CanvasFirebase && window.CanvasFirebase.uploadLeadFiles;
        var uploadPath = 'lead-uploads/production-quote/' + Date.now();
        var uploadPromise = selectedFiles.length && typeof uploadLeadFiles === 'function'
            ? uploadLeadFiles(selectedFiles, uploadPath)
            : Promise.resolve([]);

        uploadPromise
            .then(function(uploadedFiles) {
                payload.fileUploads = uploadedFiles;
                if (typeof addLead === 'function') {
                    return addLead(payload);
                }
                console.log("Lead captured (Firebase not configured):", payload);
                return Promise.resolve();
            })
            .then(function() {
                console.log("Production quote lead successfully captured");
            })
            .catch(function(err) {
                console.error("Error writing production quote lead:", err);
                payload.fileUploadError = err && err.message ? err.message : String(err);
                if (typeof addLead === 'function') {
                    addLead(payload).catch(function(fallbackErr) {
                        console.error("Error writing fallback production quote lead:", fallbackErr);
                    });
                }
            });
    });
}

/**
 * ============================================================================
 * Multi-Step Lead Capture Form
 * ============================================================================
 */
function initCaptureForm() {
    var form = document.getElementById('captureForm');
    var panel = document.getElementById('capturePanel') || form;
    if (!panel || !form) return;

    var storageKey = 'canvasBoatSurveyDraft';
    var maxStep = 6;
    var state = { step: 1, values: {} };
    var steps = form.querySelectorAll('.capture-step');
    var success = document.getElementById('captureSuccess');
    var submitButton = document.getElementById('captureSubmit');
    var nextButton = document.getElementById('captureNext');
    var backButton = document.getElementById('captureBack');
    var review = document.getElementById('captureReview');
    var saveStatus = document.getElementById('captureSaveStatus');
    var maxFileSize = 20 * 1024 * 1024;

    function getTrackingParams() {
        var params = new URLSearchParams(window.location.search);
        var tracked = {};
        ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function(key) {
            var value = params.get(key);
            if (value) tracked[key] = value;
        });
        return tracked;
    }

    function safeSave() {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(state));
            if (saveStatus) saveStatus.textContent = 'Progress saved on this device.';
        } catch (err) {
            if (saveStatus) saveStatus.textContent = 'Progress will stay while this page is open.';
        }
    }

    function safeLoad() {
        try {
            var saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
            if (saved && saved.values) state = saved;
        } catch (err) {
            state = { step: 1, values: {} };
        }
    }

    function updateProgress(stepNumber) {
        document.querySelectorAll('.capture-progress__step').forEach(function(progressStep) {
            var current = Number(progressStep.getAttribute('data-step'));
            progressStep.classList.toggle('active', current === stepNumber);
            progressStep.classList.toggle('completed', current < stepNumber);
        });

        document.querySelectorAll('.capture-progress__line').forEach(function(line) {
            var current = Number(line.getAttribute('data-line'));
            line.classList.toggle('completed', current < stepNumber);
        });
    }

    function showStep(stepNumber) {
        if (stepNumber < 1) stepNumber = 1;
        if (stepNumber > maxStep) stepNumber = maxStep;
        state.step = stepNumber;
        steps.forEach(function(step) {
            step.classList.toggle('active', Number(step.getAttribute('data-step')) === stepNumber);
        });
        updateProgress(stepNumber);
        if (backButton) backButton.style.display = stepNumber === 1 ? 'none' : 'block';
        if (nextButton) nextButton.style.display = stepNumber === maxStep ? 'none' : 'block';
        if (stepNumber === maxStep) buildReview();
        safeSave();

        if (typeof gsap !== 'undefined') {
            var activeStep = form.querySelector('.capture-step.active');
            if (activeStep) {
                gsap.fromTo(activeStep, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.28, ease: 'power2.out' });
            }
        }
    }

    function setFieldValue(fieldName, value, mode) {
        if (mode === 'multi') {
            var current = Array.isArray(state.values[fieldName]) ? state.values[fieldName] : [];
            if (current.indexOf(value) === -1) {
                current.push(value);
            } else {
                current = current.filter(function(item) { return item !== value; });
            }
            state.values[fieldName] = current;
        } else {
            state.values[fieldName] = value;
        }
        safeSave();
    }

    function hydrateCards() {
        form.querySelectorAll('[data-field]').forEach(function(group) {
            var fieldName = group.getAttribute('data-field');
            var mode = group.getAttribute('data-mode') || 'single';
            var selected = state.values[fieldName];
            group.querySelectorAll('.capture-card').forEach(function(card) {
                var value = card.getAttribute('data-value');
                var isSelected = mode === 'multi' ? (Array.isArray(selected) && selected.indexOf(value) !== -1) : selected === value;
                card.classList.toggle('selected', isSelected);
                card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            });
        });
    }

    function activateCard(card, group) {
        function handleActivation(e) {
            if (e) e.preventDefault();
            var fieldName = group.getAttribute('data-field');
            var mode = group.getAttribute('data-mode') || 'single';
            setFieldValue(fieldName, card.getAttribute('data-value'), mode);
            hydrateCards();
        }

        card.setAttribute('aria-pressed', 'false');
        card.addEventListener('click', handleActivation);
        card.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                handleActivation(e);
            }
        });
        card.addEventListener('touchstart', function() {
            card.classList.add('capture-card--touching');
        }, { passive: true });
        card.addEventListener('touchend', function(e) {
            card.classList.remove('capture-card--touching');
            handleActivation(e);
        });
        card.addEventListener('touchcancel', function() {
            card.classList.remove('capture-card--touching');
        }, { passive: true });
    }

    function syncInputsToState() {
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach(function(field) {
            if (field.type === 'file') {
                state.values[field.name] = Array.prototype.map.call(field.files || [], function(file) {
                    return { name: file.name, size: file.size, type: file.type };
                });
            } else if (field.type === 'checkbox') {
                state.values[field.name] = field.checked;
            } else {
                state.values[field.name] = field.value;
            }
        });
        safeSave();
    }

    function hydrateInputs() {
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach(function(field) {
            if (!(field.name in state.values) || field.type === 'file') return;
            if (field.type === 'checkbox') {
                field.checked = Boolean(state.values[field.name]);
            } else {
                field.value = state.values[field.name] || '';
            }
        });
    }

    function getActiveStep() {
        return form.querySelector('.capture-step.active');
    }

    function flagField(field) {
        field.classList.add('capture-field__input--error');
        field.focus();
    }

    function validateStep(stepNumber) {
        syncInputsToState();
        form.querySelectorAll('.capture-field__input--error, .capture-card-group--error').forEach(function(el) {
            el.classList.remove('capture-field__input--error', 'capture-card-group--error');
        });

        if (stepNumber === 2) {
            var boatType = state.values.boatType;
            var boatLength = form.querySelector('[name="boatLength"]');
            if (!boatType) {
                var group = form.querySelector('[data-field="boatType"]');
                if (group) group.classList.add('capture-card-group--error');
                return false;
            }
            if (!boatLength || !boatLength.value || Number(boatLength.value) <= 0) {
                flagField(boatLength);
                return false;
            }
        }

        if (stepNumber === 5) {
            var firstName = form.querySelector('[name="firstName"]');
            var phone = form.querySelector('[name="phone"]');
            var email = form.querySelector('[name="email"]');
            var privacy = form.querySelector('[name="privacyConsent"]');
            var phoneValue = phone.value.replace(/[^\d]/g, '');
            var emailValue = email.value.trim();

            if (!firstName.value.trim()) {
                flagField(firstName);
                return false;
            }

            if (phoneValue.length < 10) {
                flagField(phone);
                return false;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
                flagField(email);
                return false;
            }

            if (!privacy.checked) {
                privacy.focus();
                return false;
            }
        }

        if (stepNumber === 4) {
            var oversized = Array.prototype.some.call(form.querySelectorAll('input[type="file"]'), function(field) {
                return Array.prototype.some.call(field.files || [], function(file) {
                    return file.size > maxFileSize;
                });
            });
            if (oversized) {
                var upload = form.querySelector('input[type="file"]');
                if (upload) upload.focus();
                if (saveStatus) saveStatus.textContent = 'One file is over 20 MB. Please choose smaller files before continuing.';
                return false;
            }
        }

        return true;
    }

    function buildReview() {
        if (!review) return;
        syncInputsToState();
        var rows = [
            ['Project type', state.values.projectTypes],
            ['Boat type', state.values.boatType],
            ['Boat length', state.values.boatLength ? state.values.boatLength + ' ft' : ''],
            ['Boat', [state.values.boatYear, state.values.manufacturer, state.values.model].filter(Boolean).join(' ')],
            ['Location', [state.values.boatLocation, state.values.marinaName].filter(Boolean).join(' / ')],
            ['Coverage', state.values.coverage],
            ['Design status', state.values.designStatus],
            ['Timeframe', state.values.timeframe],
            ['Budget', state.values.budget],
            ['Photos/files', ['portPhoto', 'starboardPhoto', 'transomPhoto', 'bowPhoto', 'damagePhoto', 'artworkFiles'].map(function(key) {
                return Array.isArray(state.values[key]) && state.values[key].length ? state.values[key].map(function(file) { return file.name; }).join(', ') : '';
            }).filter(Boolean).join(' | ') || 'No files selected'],
            ['Contact', [state.values.firstName, state.values.lastName, state.values.phone, state.values.email].filter(Boolean).join(' / ')]
        ];

        review.innerHTML = rows.map(function(row) {
            var value = Array.isArray(row[1]) ? row[1].join(', ') : row[1];
            return '<div class="capture-review__row"><span>' + row[0] + '</span><strong>' + (value || 'Not answered') + '</strong></div>';
        }).join('');
    }

    function createPayload() {
        syncInputsToState();
        var tracking = getTrackingParams();
        return {
            name: [state.values.firstName, state.values.lastName].filter(Boolean).join(' '),
            firstName: state.values.firstName || '',
            lastName: state.values.lastName || '',
            phone: state.values.phone || '',
            email: state.values.email || '',
            service: 'Marine and Boat Wraps',
            source: tracking.ref || tracking.utm_source || 'get_started_boat_survey',
            formType: 'boat_wrap_survey',
            page: window.location.pathname,
            referrer: document.referrer || '',
            tracking: tracking,
            boatSurvey: state.values
        };
    }

    function getSelectedFiles() {
        var files = [];
        form.querySelectorAll('input[type="file"]').forEach(function(field) {
            Array.prototype.forEach.call(field.files || [], function(file) {
                files.push(file);
            });
        });
        return files;
    }

    form.querySelectorAll('[data-field]').forEach(function(group) {
        group.querySelectorAll('.capture-card').forEach(function(card) {
            activateCard(card, group);
        });
    });

    form.querySelectorAll('input[name], select[name], textarea[name]').forEach(function(field) {
        field.addEventListener('input', syncInputsToState);
        field.addEventListener('change', syncInputsToState);
        field.addEventListener('touchend', function() {
            window.setTimeout(syncInputsToState, 0);
        });
    });

    if (nextButton) {
        nextButton.addEventListener('click', function() {
            if (validateStep(state.step)) showStep(state.step + 1);
        });
        nextButton.addEventListener('touchend', function(e) {
            e.preventDefault();
            if (validateStep(state.step)) showStep(state.step + 1);
        });
    }

    if (backButton) {
        backButton.addEventListener('click', function() { showStep(state.step - 1); });
        backButton.addEventListener('touchend', function(e) {
            e.preventDefault();
            showStep(state.step - 1);
        });
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        if (!validateStep(5)) {
            showStep(5);
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'SENDING REQUEST...';
        }

        var payload = createPayload();
        var selectedFiles = getSelectedFiles();

        function showSuccess() {
            steps.forEach(function(step) {
                step.classList.remove('active');
            });
            if (success) success.classList.add('active');
            if (nextButton) nextButton.style.display = 'none';
            if (backButton) backButton.style.display = 'none';
            updateProgress(maxStep);
            try { sessionStorage.removeItem(storageKey); } catch (err) {}

            if (typeof gsap !== 'undefined' && success) {
                gsap.fromTo(success, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
            }
        }

        sendAnalyticsEvent(
            'generate_lead',
            { method: 'boat_wrap_survey', source: payload.source, service: payload.service },
            'Lead',
            { content_category: 'Boat Wrap Survey', content_name: payload.service }
        );

        var addLead = window.CanvasFirebase && (window.CanvasFirebase.addLead || window.CanvasFirebase.submitLead);
        var uploadLeadFiles = window.CanvasFirebase && window.CanvasFirebase.uploadLeadFiles;
        var uploadPath = 'lead-uploads/boat-wrap-survey/' + Date.now();
        var uploadPromise = selectedFiles.length && typeof uploadLeadFiles === 'function'
            ? uploadLeadFiles(selectedFiles, uploadPath)
            : Promise.resolve([]);

        uploadPromise
            .then(function(uploadedFiles) {
                payload.fileUploads = uploadedFiles;
                if (typeof addLead === 'function') {
                    return addLead(payload);
                }
                console.log('Boat survey lead captured:', payload);
                return Promise.resolve();
            })
                .then(showSuccess)
                .catch(function(err) {
                    console.error('Error submitting boat survey lead:', err);
                    payload.fileUploadError = err && err.message ? err.message : String(err);
                    if (typeof addLead === 'function') {
                        addLead(payload).finally(showSuccess);
                        return;
                    }
                    showSuccess();
                });
    });

    safeLoad();
    hydrateInputs();
    hydrateCards();
    showStep(state.step || 1);
}

/**
 * ============================================================================
 * Basic Visibility Package Lead Form
 * ============================================================================
 */
function initVisibilityPackageForm() {
    var form = document.getElementById('visibilityPackageForm');
    if (!form) return;

    var success = document.getElementById('visibilityPackageSuccess');
    var maxFileSize = 20 * 1024 * 1024;

    if (window.CanvasFirebase) {
        window.CanvasFirebase.init();
    }

    function flagField(field) {
        if (!field) return;
        field.classList.add('capture-field__input--error');
        field.focus();
    }

    function clearErrors() {
        form.querySelectorAll('.capture-field__input--error').forEach(function(field) {
            field.classList.remove('capture-field__input--error');
        });
    }

    function getTrackingParams() {
        var params = new URLSearchParams(window.location.search);
        var tracking = {};
        params.forEach(function(value, key) {
            if (key.indexOf('utm_') === 0 || key === 'ref' || key === 'gclid') {
                tracking[key] = value;
            }
        });
        return tracking;
    }

    function validate() {
        clearErrors();

        var firstName = form.querySelector('[name="firstName"]');
        var businessName = form.querySelector('[name="businessName"]');
        var phone = form.querySelector('[name="phone"]');
        var email = form.querySelector('[name="email"]');
        var packageChoice = form.querySelector('[name="packageChoice"]');
        var privacy = form.querySelector('[name="privacyConsent"]');
        var phoneValue = phone ? phone.value.replace(/[^\d]/g, '') : '';
        var emailValue = email ? email.value.trim() : '';

        if (!firstName || !firstName.value.trim()) {
            flagField(firstName);
            return false;
        }

        if (!businessName || !businessName.value.trim()) {
            flagField(businessName);
            return false;
        }

        if (!phone || phoneValue.length < 10) {
            flagField(phone);
            return false;
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
            flagField(email);
            return false;
        }

        if (!packageChoice || !packageChoice.value) {
            flagField(packageChoice);
            return false;
        }

        if (!privacy || !privacy.checked) {
            privacy.focus();
            return false;
        }

        var oversized = Array.prototype.some.call(form.querySelectorAll('input[type="file"]'), function(field) {
            return Array.prototype.some.call(field.files || [], function(file) {
                return file.size > maxFileSize;
            });
        });

        if (oversized) {
            flagField(form.querySelector('input[type="file"]'));
            return false;
        }

        return true;
    }

    function getFieldValue(name) {
        var field = form.querySelector('[name="' + name + '"]');
        if (!field) return '';
        if (field.type === 'checkbox') return field.checked;
        return field.value.trim();
    }

    function createPayload() {
        var tracking = getTrackingParams();
        var firstName = getFieldValue('firstName');
        var lastName = getFieldValue('lastName');
        var packageChoice = getFieldValue('packageChoice');
        var monthlyMarketingItem = getFieldValue('printedItem');
        var businessName = getFieldValue('businessName');
        var businessType = getFieldValue('businessType');
        var businessGoal = getFieldValue('businessGoal');
        var notes = getFieldValue('notes');

        return {
            name: [firstName, lastName].filter(Boolean).join(' '),
            firstName: firstName,
            lastName: lastName,
            phone: getFieldValue('phone'),
            email: getFieldValue('email'),
            businessName: businessName,
            businessType: businessType,
            service: 'Basic Visibility Package',
            source: tracking.ref || tracking.utm_source || 'basic_visibility_package',
            formType: 'basic_visibility_package',
            page: window.location.pathname,
            referrer: document.referrer || '',
            tracking: tracking,
            message: [
                'Package: ' + packageChoice,
                'Monthly marketing item: ' + (monthlyMarketingItem || 'Not selected'),
                'Business: ' + businessName,
                'Business type: ' + (businessType || 'Not provided'),
                'Goal: ' + (businessGoal || 'Not provided'),
                'Notes: ' + (notes || 'Not provided')
            ].join('\n'),
            visibilityPackage: {
                packageChoice: packageChoice,
                printedItem: monthlyMarketingItem,
                monthlyMarketingItem: monthlyMarketingItem,
                businessName: businessName,
                businessType: businessType,
                currentLinks: getFieldValue('currentLinks'),
                businessGoal: businessGoal,
                notes: notes,
                hasPhotos: getFieldValue('hasPhotos'),
                needsFilming: getFieldValue('needsFilming'),
                privacyConsent: getFieldValue('privacyConsent')
            }
        };
    }

    function showSuccess() {
        form.querySelectorAll('.visibility-form__intro, .capture-field-grid, .capture-fields').forEach(function(section) {
            section.style.display = 'none';
        });
        if (success) success.classList.add('active');
        try { sessionStorage.removeItem('visibility_package_lead'); } catch (err) {}
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        if (!validate()) return;

        var submitButton = form.querySelector('button[type="submit"]');
        var originalText = submitButton ? submitButton.textContent : '';
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'SENDING REQUEST...';
        }

        var payload = createPayload();
        var addLead = window.CanvasFirebase && (window.CanvasFirebase.addLead || window.CanvasFirebase.submitLead);

        sendAnalyticsEvent(
            'generate_lead',
            { method: 'basic_visibility_package', source: payload.source, service: payload.service },
            'Lead',
            { content_category: 'Visibility Package', content_name: payload.visibilityPackage.packageChoice }
        );

        Promise.resolve()
            .then(function() {
                if (typeof addLead === 'function') {
                    return addLead(payload);
                }
                console.log('Visibility package lead captured:', payload);
                return Promise.resolve();
            })
            .then(showSuccess)
            .catch(function(err) {
                console.error('Error submitting visibility package lead:', err);
                payload.submitError = err && err.message ? err.message : String(err);
                try {
                    var pendingLeads = JSON.parse(localStorage.getItem('pending_leads') || '[]');
                    pendingLeads.push(Object.assign({}, payload, { timestamp: new Date().toISOString() }));
                    localStorage.setItem('pending_leads', JSON.stringify(pendingLeads));
                } catch (storageError) {
                    console.warn('Could not save visibility package lead locally');
                }
                showSuccess();
            })
            .finally(function() {
                if (submitButton) {
                    submitButton.textContent = originalText;
                    submitButton.disabled = false;
                }
            });
    });
}

/* ===================================
   Print & Ship Campaign Form
   =================================== */
function initProductionCampaignForm() {
    var form = document.getElementById('productionCampaignForm');
    var campaignName = document.body.getAttribute('data-campaign');
    if (!form && !campaignName) return;

    document.querySelectorAll('[data-campaign-cta]').forEach(function (cta) {
        cta.addEventListener('click', function () {
            sendAnalyticsEvent('campaign_cta_click', {
                campaign: campaignName || 'print_ship_vinyl',
                cta: cta.getAttribute('data-campaign-cta'),
                page_path: window.location.pathname
            });
        });
    });

    if (!form) return;
    var success = document.getElementById('productionCampaignSuccess');

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var submit = form.querySelector('button[type="submit"]');
        var originalText = submit ? submit.textContent : '';
        var data = new FormData(form);
        var params = new URLSearchParams(window.location.search);
        var tracking = {};

        params.forEach(function (value, key) {
            if (key.indexOf('utm_') === 0 || key === 'gclid' || key === 'ref') tracking[key] = value;
        });

        var lead = {
            name: data.get('name') || '',
            phone: data.get('phone') || '',
            email: data.get('email') || '',
            businessName: data.get('businessName') || '',
            service: 'Print and Ship Vinyl Production',
            source: tracking.utm_source || tracking.ref || 'print_ship_campaign',
            formType: 'print_ship_campaign',
            page: window.location.pathname,
            referrer: document.referrer || '',
            tracking: tracking,
            message: [
                'Product: ' + (data.get('product') || 'Not selected'),
                'Quantity / size: ' + (data.get('quantity') || 'Not provided'),
                'Delivery: ' + (data.get('delivery') || 'Not selected'),
                'Deadline: ' + (data.get('deadline') || 'Not provided'),
                'Notes: ' + (data.get('notes') || 'Not provided')
            ].join('\n'),
            productionRequest: {
                product: data.get('product') || '',
                quantity: data.get('quantity') || '',
                delivery: data.get('delivery') || '',
                deadline: data.get('deadline') || '',
                notes: data.get('notes') || ''
            }
        };

        if (!lead.name.trim() || lead.phone.replace(/[^0-9]/g, '').length < 10 || !lead.email.trim() || !lead.productionRequest.product) {
            form.classList.add('campaign-form--invalid');
            return;
        }

        form.classList.remove('campaign-form--invalid');
        if (submit) {
            submit.disabled = true;
            submit.textContent = document.documentElement.lang === 'es' ? 'ENVIANDO...' : 'SENDING...';
        }

        loadFirebaseSdk().then(function (services) {
            var submitLead = services && (services.addLead || services.submitLead);
            if (typeof submitLead !== 'function') throw new Error('Lead service unavailable');
            return submitLead(lead);
        }).then(function () {
            sendAnalyticsEvent('generate_lead', {
                method: 'print_ship_campaign',
                campaign: campaignName || 'print_ship_vinyl',
                product: lead.productionRequest.product
            }, 'Lead', { content_category: 'Print and Ship Vinyl' });
            form.hidden = true;
            if (success) success.hidden = false;
        }).catch(function (error) {
            console.error('Print and ship campaign lead error:', error);
            try {
                var pendingLeads = JSON.parse(localStorage.getItem('pending_leads') || '[]');
                pendingLeads.push(Object.assign({}, lead, { timestamp: new Date().toISOString() }));
                localStorage.setItem('pending_leads', JSON.stringify(pendingLeads));
                form.hidden = true;
                if (success) success.hidden = false;
            } catch (storageError) {
                form.classList.add('campaign-form--invalid');
            }
        }).finally(function () {
            if (submit) {
                submit.disabled = false;
                submit.textContent = originalText;
            }
        });
    });
}

/**
 * ============================================================================
 * Review Funnel Initialization
 * ============================================================================
 */
function initReviewFunnel() {
    const starContainer = document.getElementById('starRatingContainer');
    if (!starContainer) return;

    const stars = starContainer.querySelectorAll('.star');
    const positiveFeedback = document.getElementById('positiveFeedback');
    const negativeFeedback = document.getElementById('negativeFeedback');
    const starSelection = document.getElementById('starSelection');
    let hasSelected = false;

    // Hover effect
    stars.forEach(star => {
        star.addEventListener('mouseover', function() {
            if (hasSelected) return;
            const rating = parseInt(this.getAttribute('data-rating'));
            stars.forEach(s => {
                const sRating = parseInt(s.getAttribute('data-rating'));
                if (sRating <= rating) {
                    s.style.color = 'var(--accent)';
                } else {
                    s.style.color = 'rgba(255,255,255,0.3)';
                }
            });
        });

        star.addEventListener('mouseout', function() {
            if (hasSelected) return;
            stars.forEach(s => {
                s.style.color = 'rgba(255,255,255,0.3)';
            });
        });

        // Click logic (routing)
        star.addEventListener('click', function() {
            if (hasSelected) return;
            hasSelected = true;
            const rating = parseInt(this.getAttribute('data-rating'));
            
            // Lock the color
            stars.forEach(s => {
                const sRating = parseInt(s.getAttribute('data-rating'));
                if (sRating <= rating) {
                    s.style.color = 'var(--accent)';
                } else {
                    s.style.color = 'rgba(255,255,255,0.3)';
                }
            });

            // Delay slightly for effect, then route
            setTimeout(() => {
                starSelection.style.display = 'none';
                if (rating >= 4) {
                    positiveFeedback.style.display = 'block';
                } else {
                    negativeFeedback.style.display = 'block';
                }
            }, 300);
        });
    });

    // Handle private feedback form
    const form = document.getElementById('privateFeedbackForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;

            const formData = new FormData(form);
            const feedbackData = {
                name: formData.get('name') || '',
                email: formData.get('email') || '',
                phone: 'N/A',
                service: 'Private Feedback',
                message: formData.get('message') || '',
                source: 'review'
            };

            try {
                if (window.CanvasFirebase && typeof firebase !== 'undefined') {
                    await window.CanvasFirebase.submitLead(feedbackData);
                } else {
                    console.log('Private feedback captured locally (Firebase not initialized):', feedbackData);
                }
                form.style.display = 'none';
                document.getElementById('feedbackSuccess').style.display = 'block';
            } catch (error) {
                console.error('Error submitting private feedback:', error);
                // Even on error, show the success state to the user so they aren't blocked,
                // and fallback to local storage backup just in case
                form.style.display = 'none';
                document.getElementById('feedbackSuccess').style.display = 'block';
                try {
                    const pendingLeads = JSON.parse(localStorage.getItem('pending_leads') || '[]');
                    pendingLeads.push(Object.assign({}, feedbackData, { timestamp: new Date().toISOString() }));
                    localStorage.setItem('pending_leads', JSON.stringify(pendingLeads));
                } catch (e) {
                    console.warn('Could not save feedback locally');
                }
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
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
      ["printed_vinyl", "stickers_decals"].includes(product)
        ? ["vinyl"]
        : product === "banners"
          ? ["banner"]
          : ["coroplast", "acm"].includes(product)
            ? [product]
            : paper
              ? [d.collateralProduct === "business_cards" ? "card" : "paper"]
              : product === "wall_murals"
                ? ["wall"]
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
        (rules.material.length > 1 && !rules.material.includes(data.material)) ||
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
      material: rules.material.length === 1 ? rules.material[0] : d.material,
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
      $("vinylMaterialDetails").hidden = !r.vinylGrade;
      if (!r.vinylGrade) $("vinylMaterialDetails").open = false;
      $("material").parentElement.hidden = r.material.length === 1;
      const gradeInformation = {
        recommend: tr("We’ll recommend a grade and film for your project.", "Le recomendaremos una opción y película para su proyecto."),
        commercial: tr("General Formulations and Canvas Escape options. We’ll confirm the right film for your project.", "Opciones de General Formulations y Canvas Escape. Confirmaremos la película adecuada para su proyecto."),
        premium: tr("Premium film options selected for your project. Exact brand and film confirmed with your quote.", "Opciones de películas premium seleccionadas para su proyecto. La marca y película exactas se confirmarán con su cotización.")
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


// Commerce uses the website proxy, never a CRM credential/capability or client price.
window.initCanvasCommerce = async function () {
    const es = document.documentElement.lang === 'es';
    const txt = (en, spanish) => es ? spanish : en;
    const valueLabel = (value) => ({
        area: txt('Area', 'Superficie'), piece: txt('Per piece', 'Por pieza'), pack: txt('Packs', 'Paquetes'),
        garment_matrix: txt('Garment variants', 'Variantes de prendas'), material: txt('Material', 'Material'), finish: txt('Finish', 'Acabado'),
        vinyl: txt('Vinyl', 'Vinilo'), hem: txt('Hem', 'Dobladillo'), pocket: txt('Pole pocket', 'Bolsillo para poste'),
        unpaid: txt('Unpaid', 'Sin pagar'), paid: txt('Paid', 'Pagado'), pending: txt('Pending', 'Pendiente'),
        authorized: txt('Authorized, not captured', 'Autorizado, no cobrado'), failed: txt('Verified failure', 'Fallo verificado'),
        unknown: txt('Being reconciled', 'En conciliación'), awaiting_review: txt('Awaiting review', 'Pendiente de revisión'),
        changes_requested: txt('Changes requested', 'Cambios solicitados'), approved: txt('Approved', 'Aprobado'),
        source: txt('Source', 'Original'), final: txt('Final', 'Final'), needs_review: txt('Needs staff review', 'Requiere revisión técnica'),
        ready: txt('Ready', 'Listo'), quarantined: txt('Quarantined', 'En cuarentena'), needs_correction: txt('Needs correction', 'Requiere corrección')
    })[value] || value;
    const app = document.getElementById('commerce-app');
    const message = document.getElementById('commerce-message');
    const api = window.CanvasFirebase.commerce;
    const preview = app.hasAttribute('data-commerce-preview') && ['localhost', '127.0.0.1'].includes(location.hostname);
    if (preview) {
        window.CanvasFinix = { tokenize: async () => (await (await fetch('/preview/tokenize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).token };
        const contact = document.getElementById('commerce-contact');
        contact.elements.name.value = 'Synthetic Canvas Customer';
        contact.elements.email.value = 'canvas-preview@example.com';
        contact.elements.phone.value = '5125550106';
    }
    const uid = () => crypto.randomUUID().replaceAll('-', '_');
    const money = (n) => new Intl.NumberFormat(es ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
    const node = (tag, text, attrs = {}) => {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
        return el;
    };
    const button = (label, handler, secondary = false) => {
        const el = node('button', label, { type: 'button', class: 'c-button' + (secondary ? ' c-button--secondary' : '') });
        el.addEventListener('click', () => run(el, handler));
        return el;
    };
    const field = (form, label, name, type = 'text', attrs = {}) => {
        const wrap = node('label', label);
        const control = node(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input', null, { name, ...attrs });
        if (control.tagName === 'INPUT') control.type = type;
        wrap.append(control); form.append(wrap); return control;
    };
    const select = (form, label, name, values) => {
        const el = field(form, label, name, 'select');
        values.forEach(([value, text]) => el.append(node('option', text, { value })));
        return el;
    };
    const statusText = {
        financial_hold: txt('Payment holds production', 'El pago detiene la producción'),
        needs_artwork: txt('Artwork required', 'Faltan archivos'),
        staff_review: txt('Staff preflight / final preparation', 'Revisión técnica y preparación final'),
        needs_correction: txt('Artwork corrections required', 'Se requieren correcciones'),
        awaiting_proof: txt('Final proof approval required', 'Falta aprobar la prueba final'),
        missing_specs: txt('Specifications incomplete', 'Especificaciones incompletas'),
        revision_hold: txt('Revision holds production', 'La revisión detiene la producción'),
        ready: txt('Ready for staff production release', 'Listo para liberación de producción'),
        cancelled: txt('Cancelled', 'Cancelado')
    };
    const errorText = {
        commerce_disabled: txt('Online checkout is not released yet. Your existing quote form still works.', 'La compra en línea aún no está habilitada. El formulario de cotización sigue disponible.'),
        checkout_cutover_pending: txt('Checkout awaits the reviewed payment-provider cutover.', 'La compra espera el cambio aprobado de proveedor de pago.'),
        quote_expired: txt('This quote expired. Request a fresh price and accept it again.', 'Esta cotización venció. Solicita un nuevo precio y acéptalo.'),
        idempotency_conflict: txt('This retry differs from the saved request. Do not create a second payment; recover the original order.', 'Este reintento difiere del original. No crees otro pago; recupera tu pedido.'),
        checkout_attempt_active: txt('A payment is already being reconciled. Retry the saved attempt or refresh status.', 'Ya se está conciliando un pago. Reintenta el original o actualiza el estado.'),
        upload_expired: txt('The temporary upload expired. Reselect the file to create a new upload identity.', 'La carga temporal venció. Selecciona el archivo de nuevo para iniciar otra carga.'),
        proof_stale: txt('Artwork changed. Refresh and review the new proof.', 'Los archivos cambiaron. Actualiza y revisa la nueva prueba.'),
        delivery_uncertain: txt('The response is uncertain. Retry the SAME saved request; do not start another order/payment.', 'La respuesta es incierta. Reintenta la MISMA solicitud; no crees otro pedido o pago.')
    };
    const announce = (text, error = false) => {
        message.textContent = text; message.dataset.error = String(error);
    };
    async function run(control, task) {
        if (control?.disabled) return;
        if (control) control.disabled = true;
        try { await task(); }
        catch (error) { announce(errorText[error.code] || txt('Could not complete this step: ', 'No se completó este paso: ') + (error.code || error.message), true); }
        finally { if (control?.isConnected) control.disabled = false; }
    }
    const restore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
    let cart = restore('canvas_commerce_cart_v1', []);
    let catalog, quote, order, publicConfiguration;
    let checkout = restore('canvas_commerce_checkout_v1', null);
    let payment = restore('canvas_commerce_payment_v1', null);
    let uploads = restore('canvas_commerce_uploads_v1', {});
    const saveCart = () => localStorage.setItem('canvas_commerce_cart_v1', JSON.stringify(cart));
    const invalidate = () => {
        quote = null; document.getElementById('commerce-quote').replaceChildren();
        document.getElementById('commerce-checkout').hidden = true;
    };
    const pricedRow = (parent, label, amount, total = false) => {
        const row = node('div', null, { class: 'c-price-row' + (total ? ' c-total' : '') });
        row.append(node('span', label), node('span', money(amount))); parent.append(row);
    };
    function renderConfig() {
        const form = document.getElementById('commerce-config'); form.replaceChildren();
        const product = select(form, txt('Product', 'Producto'), 'product', catalog.products.map((p) => [p.productId, p.name[es ? 'es' : 'en']]));
        const fields = node('div', null, { class: 'c-fields' }); form.append(fields);
        const update = () => {
            fields.replaceChildren();
            const p = catalog.products.find((p) => p.productId === product.value);
            fields.append(node('p', txt('Pricing mode: ', 'Tipo de precio: ') + valueLabel(p.mode) + (p.mode === 'pack' ? txt(' · pieces per pack: ', ' · piezas por paquete: ') + p.unitsPerPack : ''), { class: 'c-small' }));
            if (p.availability !== 'available' || !p.capacityApproved) {
                fields.append(node('p', txt('This product needs a staff quote or is unavailable.', 'Este producto requiere cotización o no está disponible.')));
                return;
            }
            if (p.mode === 'area' || p.maxWidthIn || p.maxHeightIn) {
                const dimensions = node('div', null, { class: 'c-row' });
                field(dimensions, txt('Width', 'Ancho'), 'width', 'number', { min: '.001', step: 'any', required: '', value: '3' });
                field(dimensions, txt('Height', 'Alto'), 'height', 'number', { min: '.001', step: 'any', required: '', value: '4' });
                fields.append(dimensions);
                select(fields, txt('Dimension unit', 'Unidad'), 'unit', ['ft', 'in', 'mm', 'cm', 'm'].map((s) => [s, s]));
            }
            field(fields, p.mode === 'pack' ? txt('Packs', 'Paquetes') : txt('Quantity', 'Cantidad'), 'quantity', 'number', {
                min: p.minimumQuantity, max: p.maximumQuantity, required: '', value: p.minimumQuantity, step: '1'
            });
            for (const [name, values] of Object.entries(p.options)) select(fields, valueLabel(name), 'option_' + name, values.map((v) => [v, valueLabel(v)]));
            if (p.mode === 'garment_matrix') {
                fields.append(node('p', txt('Allocate quantities by garment variant; total must match quantity.', 'Asigna cantidades por variante; la suma debe igualar la cantidad.')));
                p.garmentStock.forEach((v, i) => {
                    field(fields, v.color + ' / ' + v.size + ' · ' + txt('Available ', 'Disponible ') + v.available,
                        'variant_' + i, 'number', { min: 0, max: v.available, value: 0, step: 1 });
                    field(fields, txt('Personalization (optional)', 'Personalización (opcional)') + ' · ' + v.color + ' / ' + v.size,
                        'personalization_' + i, 'text', { maxlength: 200 });
                });
            }
            select(fields, txt('Artwork plan', 'Plan de archivos'), 'artworkMode', [
                ['later', txt('Upload after purchase', 'Subir después de comprar')],
                ['now', txt('Ready to upload after checkout', 'Listo para subir al finalizar la compra')],
                ['design_help', txt('I need design help (quoted by CRM)', 'Necesito diseño (precio del CRM)')]
            ]);
            field(fields, txt('Design brief / notes', 'Descripción del diseño'), 'designBrief', 'textarea', { maxlength: 2000 });
            fields.append(node('p', txt('Each cart item is a separate purchased item. Multiple designs can be allocated after purchase.', 'Cada artículo es una compra independiente. Puedes asignar varios diseños después de comprar.'), { class: 'c-small' }));
            const add = node('button', txt('Add to order', 'Agregar al pedido'), { type: 'submit', class: 'c-button' }); fields.append(add);
        };
        product.addEventListener('change', update); update();
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const p = catalog.products.find((p) => p.productId === product.value);
            const data = new FormData(form); const variants = p.garmentStock.flatMap((v, i) => Number(data.get('variant_' + i)) > 0
                ? [{ sku: v.sku, color: v.color, size: v.size, quantity: Number(data.get('variant_' + i)),
                    ...(data.get('personalization_' + i) ? { personalization: data.get('personalization_' + i) } : {}) }] : []);
            const configuration = { quantity: Number(data.get('quantity')), options: Object.fromEntries(Object.keys(p.options).map((key) => [key, data.get('option_' + key)])),
                variants, artworkMode: data.get('artworkMode'), designBrief: data.get('designBrief'), notes: '' };
            if (data.has('width')) configuration.dimensions = { width: Number(data.get('width')), height: Number(data.get('height')), unit: data.get('unit') };
            const editing = app.dataset.editLineItem;
            const index = cart.findIndex((item) => item.lineItemId === editing);
            const next = { lineItemId: index >= 0 ? editing : uid(), productId: p.productId, configuration };
            if (index >= 0) cart[index] = next; else cart.push(next);
            delete app.dataset.editLineItem;
            form.querySelector('[type=submit]').textContent = txt('Add to order', 'Agregar al pedido');
            saveCart(); invalidate(); renderCart(); announce(txt('Item added. Request the authoritative price below.', 'Artículo agregado. Solicita el precio autorizado abajo.'));
        }, { once: false });
    }
    function renderCart() {
        const holder = document.getElementById('commerce-cart'); holder.replaceChildren();
        if (!cart.length) { holder.append(node('p', txt('Your order starts here.', 'Tu pedido comienza aquí.'))); return; }
        cart.forEach((item, i) => {
            const p = catalog.products.find((p) => p.productId === item.productId);
            const block = node('article', null, { class: 'c-line' });
            block.append(node('h3', (i + 1) + '. ' + (p?.name[es ? 'es' : 'en'] || item.productId)),
                node('p', txt('Quantity: ', 'Cantidad: ') + item.configuration.quantity),
                node('p', Object.entries(item.configuration.options).map(([k, v]) => valueLabel(k) + ': ' + valueLabel(v)).join(' · '), { class: 'c-small' }));
            if (item.configuration.dimensions) block.append(node('p', item.configuration.dimensions.width + ' × ' + item.configuration.dimensions.height + ' ' + item.configuration.dimensions.unit));
            block.append(button(txt('Edit configuration', 'Editar configuración'), async () => {
                const form = document.getElementById('commerce-config');
                form.elements.product.value = item.productId; form.elements.product.dispatchEvent(new Event('change'));
                const c = item.configuration; const fill = (name, value) => { if (form.elements[name] && value != null) form.elements[name].value = value; };
                fill('quantity', c.quantity); fill('width', c.dimensions?.width); fill('height', c.dimensions?.height); fill('unit', c.dimensions?.unit);
                fill('artworkMode', c.artworkMode); fill('designBrief', c.designBrief);
                for (const [name, value] of Object.entries(c.options)) fill('option_' + name, value);
                p?.garmentStock.forEach((v, index) => { const variant = c.variants.find((row) => row.sku === v.sku && row.color === v.color && row.size === v.size);
                    fill('variant_' + index, variant?.quantity || 0); fill('personalization_' + index, variant?.personalization || ''); });
                app.dataset.editLineItem = item.lineItemId;
                form.querySelector('[type=submit]').textContent = txt('Save configuration', 'Guardar configuración');
                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, true), button(txt('Duplicate as a separate item', 'Duplicar como artículo independiente'), async () => {
                cart.push({ ...structuredClone(item), lineItemId: uid() }); saveCart(); invalidate(); renderCart();
            }, true), button(txt('Remove', 'Quitar'), async () => { cart.splice(i, 1); saveCart(); invalidate(); renderCart(); }, true)); holder.append(block);
        });
        const delivery = select(holder, txt('Delivery / destination zone', 'Entrega / zona'), 'delivery',
            catalog.deliveryRules.map((r, i) => [i, r.methodId + ' · ' + r.zone]));
        const address = node('div', null, { class: 'c-fields' }); holder.append(address);
        const updateAddress = () => {
            address.replaceChildren();
            if (catalog.deliveryRules[Number(delivery.value)].kind === 'shipping') {
                for (const [key, en, spanish] of [['line1', 'Address', 'Dirección'], ['line2', 'Unit (optional)', 'Unidad (opcional)'],
                    ['city', 'City', 'Ciudad'], ['region', 'State / region', 'Estado'], ['postalCode', 'Postal code', 'Código postal'], ['country', 'Country (2-letter code)', 'País (2 letras)']])
                    field(address, txt(en, spanish), key, 'text', { maxlength: key === 'country' ? 2 : 200 });
            }
        };
        delivery.addEventListener('change', () => { invalidate(); updateAddress(); }); updateAddress();
        holder.append(button(txt('Get authoritative price', 'Obtener precio autorizado'), async () => {
            const rule = catalog.deliveryRules[Number(delivery.value)];
            const destination = { methodId: rule.methodId, destinationZone: rule.zone };
            if (rule.kind === 'shipping') destination.address = Object.fromEntries([...address.querySelectorAll('input')].map((input) => [input.name, input.value]));
            const requestId = uid();
            quote = await api('quote', { version: 'canvas-commerce.v1', requestId, catalogVersion: catalog.version, items: cart,
                delivery: destination, locale: es ? 'es' : 'en' }, requestId);
            renderQuote();
        }));
    }
    function renderQuote() {
        const holder = document.getElementById('commerce-quote'); holder.replaceChildren();
        quote.items.forEach((item) => {
            const block = node('article', null, { class: 'c-line' });
            block.append(node('h3', item.name), node('p', txt('Purchased pieces: ', 'Piezas compradas: ') + item.pieces));
            for (const [key, en, spanish] of [['baseMinor', 'Base print', 'Impresión base'], ['optionsMinor', 'Options', 'Opciones'],
                ['setupMinor', 'Setup', 'Preparación'], ['designMinor', 'Design help', 'Diseño']]) pricedRow(block, txt(en, spanish), item.price[key]);
            pricedRow(block, txt('Item tax', 'Impuesto del artículo'), item.taxMinor); holder.append(block);
        });
        pricedRow(holder, txt('Shipping', 'Envío'), quote.shippingMinor);
        pricedRow(holder, txt('Tax (includes item taxes)', 'Impuesto (incluye impuestos por artículo)'), quote.taxMinor);
        pricedRow(holder, txt('Order total', 'Total del pedido'), quote.totalMinor, true);
        holder.append(node('p', txt('Price valid until ', 'Precio válido hasta ') + new Date(quote.expiresAt).toLocaleString(), { class: 'c-small' }));
        document.getElementById('commerce-terms').textContent = txt('I accept this exact quote and terms version ', 'Acepto esta cotización exacta y los términos versión ') + quote.termsVersion;
        if (publicConfiguration?.termsUrl) document.getElementById('commerce-terms').append(node('a', txt(' Read terms', ' Leer términos'), { href: publicConfiguration.termsUrl, class: 'c-text-link', target: '_blank', rel: 'noopener noreferrer' }));
        if (!preview && !publicConfiguration?.termsUrl) {
            announce(txt('Purchase terms are not configured. Checkout is not ready for release.', 'No están configurados los términos de compra. La compra aún no está lista.'), true);
            return;
        }
        document.getElementById('commerce-contact').elements.terms.checked = false;
        document.getElementById('commerce-checkout').hidden = false;
        announce(txt('CRM price received. No payment has been taken.', 'Precio recibido del CRM. No se ha cobrado.'));
    }
    async function checkoutSaved() {
        const result = await api('checkout', checkout.body || sessionStorage.getItem('canvas_commerce_checkout_payload_v1'), checkout.attemptId);
        checkout.state = 'accepted'; delete checkout.body;
        localStorage.setItem('canvas_commerce_checkout_v1', JSON.stringify(checkout));
        sessionStorage.removeItem('canvas_commerce_checkout_payload_v1');
        localStorage.setItem('canvas_commerce_last_order_v1', result.id);
        order = await api('order', { orderId: result.id }); await renderOrder();
    }
    document.getElementById('commerce-contact').addEventListener('submit', (event) => {
        event.preventDefault();
        run(event.submitter, async () => {
            if (!quote || quote.expiresAt <= Date.now()) throw Object.assign(new Error(), { code: 'quote_expired' });
            if (checkout && checkout.state !== 'accepted') return checkoutSaved();
            if (checkout && checkout.quoteHash === quote.quoteHash) return checkoutSaved();
            const data = new FormData(event.currentTarget);
            const attemptId = uid();
            const contact = { name: data.get('name'), email: data.get('email') };
            if (data.get('phone')) contact.phone = data.get('phone');
            checkout = { attemptId, quoteHash: quote.quoteHash, body: JSON.stringify({
                version: 'canvas-commerce.v1', quoteId: quote.quoteId, acceptedHash: quote.quoteHash, termsVersion: quote.termsVersion, sourceOrderId: attemptId, contact
            }) };
            // Preserve the exact serialized checkout before delivery, including lost response recovery.
            sessionStorage.setItem('canvas_commerce_checkout_payload_v1', checkout.body);
            localStorage.setItem('canvas_commerce_checkout_v1', JSON.stringify({ attemptId, quoteHash: checkout.quoteHash, state: 'pending' }));
            await checkoutSaved();
        });
    });
    async function refresh() { order = await api('order', { orderId: order.id }); await renderOrder(); }
    async function pay(collection = 'required') {
        if (order.financial === 'failed') {
            payment = null;
            sessionStorage.removeItem('canvas_commerce_payment_payload_v1');
        }
        if (payment && payment.orderId === order.id && (payment.collection || 'required') === collection) {
            // Retry existing server intent; if the initial HTTP request never
            // reached it, the tab retains the same token bytes, not a new charge.
            try { await api('payment', null, payment.attemptId); }
            catch (error) {
                const saved = sessionStorage.getItem('canvas_commerce_payment_payload_v1');
                if (error.code !== 'retry_not_found' || !saved) throw error;
                await api('payment', saved, payment.attemptId);
            }
        } else {
            if (!window.CanvasFinix || typeof window.CanvasFinix.tokenize !== 'function') {
                announce(txt('Finix sandbox tokenization is not configured. No payment has been submitted.', 'La tokenización de prueba Finix no está configurada. No se envió ningún pago.'), true); return;
            }
            const token = await window.CanvasFinix.tokenize();
            payment = { orderId: order.id, attemptId: uid(), collection, state: 'pending' };
            localStorage.setItem('canvas_commerce_payment_v1', JSON.stringify(payment));
            const raw = JSON.stringify({ orderId: order.id, requestId: payment.attemptId, token, collection });
            sessionStorage.setItem('canvas_commerce_payment_payload_v1', raw);
            const result = await api('payment', raw, payment.attemptId);
            payment.state = result.state; localStorage.setItem('canvas_commerce_payment_v1', JSON.stringify(payment));
        }
        await refresh();
        if (order.financial === 'paid') sessionStorage.removeItem('canvas_commerce_payment_payload_v1');
    }
    async function mountPayment(holder) {
        if (preview || !publicConfiguration?.finixApplicationId) return;
        if (!window.Finix) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://js.finix.com/v/2/finix.js'; script.defer = true;
                script.addEventListener('load', resolve, { once: true });
                script.addEventListener('error', () => reject(new Error('finix_form_unavailable')), { once: true });
                document.head.append(script);
            });
        }
        const mount = node('div', null, { id: 'commerce-finix-form' }); holder.append(mount);
        let valid = false;
        const form = window.Finix.PaymentForm(mount, 'sandbox', publicConfiguration.finixApplicationId, {
            paymentMethods: ['card'], showAddress: true,
            onUpdate: (_state, _bin, hasErrors) => { valid = !hasErrors; }
        });
        window.CanvasFinix = { tokenize: () => new Promise((resolve, reject) => {
            if (!valid) return reject(new Error(txt('Complete the secure payment form.', 'Completa el formulario de pago seguro.')));
            form.submit((error, response) => {
                const token = response?.data?.id;
                if (error || !/^TK[A-Za-z0-9]{10,100}$/.test(token || '')) reject(new Error('tokenization_failed'));
                else resolve(token);
            });
        }) };
    }
    async function upload(file, item, placement, assignmentId, allocatedQuantity) {
        if (!file || !['image/png', 'image/jpeg', 'application/pdf'].includes(file.type)
            || file.size <= 0 || file.size > item.purchased.productionPolicy.maxFileBytes) {
            throw new Error(txt('Choose a supported file within the purchased size limit.', 'Elige un archivo permitido dentro del límite comprado.'));
        }
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map((v) => v.toString(16).padStart(2, '0')).join('');
        const key = [order.id, item.lineItemId, placement, assignmentId, allocatedQuantity, sha256].join(':');
        let intent = uploads[key];
        if (!intent || intent.expired) {
            const requestId = uid();
            intent = { attemptId: requestId, body: JSON.stringify({ orderId: order.id, lineItemId: item.lineItemId, placement,
                assignmentId, allocatedQuantity, role: 'source', filename: file.name, mime: file.type, size: file.size, sha256, requestId }) };
            uploads[key] = intent; localStorage.setItem('canvas_commerce_uploads_v1', JSON.stringify(uploads));
        }
        try {
            if (intent.sessionId) {
                try {
                    await api('complete-upload', { orderId: order.id, sessionId: intent.sessionId }, intent.attemptId + '_complete');
                    await refresh(); return;
                } catch (error) {
                    // A completed object with a lost response is recovered without
                    // uploading/replacing it. Incomplete storage is safe to resume.
                    if (!['temporarily_unavailable', 'delivery_uncertain'].includes(error.code)) throw error;
                }
            }
            const session = await api('create-upload', intent.body, intent.attemptId);
            intent.sessionId = session.sessionId;
            localStorage.setItem('canvas_commerce_uploads_v1', JSON.stringify(uploads));
            if (!session.completed) {
                if (session.expiresAt <= Date.now()) throw Object.assign(new Error(), { code: 'upload_expired' });
                // Temporary upload capability exists only for this browser operation.
                // Probe accepted bytes before resuming each chunk; never analytics/log it.
                let offset = 0;
                while (offset < file.size) {
                    const end = Math.min(offset + 256 * 1024, file.size);
                    let response;
                    try {
                        response = await fetch(session.uploadUrl, { method: 'PUT', credentials: 'omit',
                            headers: { 'Content-Type': file.type, 'Content-Range': 'bytes ' + offset + '-' + (end - 1) + '/' + file.size },
                            body: file.slice(offset, end) });
                    } catch {
                        response = await fetch(session.uploadUrl, { method: 'PUT', credentials: 'omit',
                            headers: { 'Content-Range': 'bytes */' + file.size, 'Content-Length': '0' } });
                    }
                    if (response.status === 308) {
                        const range = response.headers.get('Range');
                        const next = range ? Number(range.split('-')[1]) + 1 : 0;
                        if (next <= offset) throw Object.assign(new Error(), { code: 'delivery_uncertain' });
                        offset = next;
                    } else if (response.ok) { offset = file.size; }
                    else throw Object.assign(new Error(), { code: 'upload_failed' });
                }
            }
            await api('complete-upload', { orderId: order.id, sessionId: session.sessionId }, intent.attemptId + '_complete');
            announce(txt('File received for the selected item/design. Staff review is still required.', 'Archivo recibido para el artículo y diseño seleccionado. Aún requiere revisión técnica.'));
            await refresh();
        } catch (error) {
            if (error.code === 'upload_expired') { intent.expired = true; localStorage.setItem('canvas_commerce_uploads_v1', JSON.stringify(uploads)); }
            throw error;
        }
    }
    async function renderOrder() {
        const holder = document.getElementById('commerce-order'); holder.replaceChildren(); holder.hidden = false;
        holder.append(node('h2', txt('Your order', 'Tu pedido')), node('p', order.id, { class: 'c-order-id' }));
        const badges = node('div', null, { class: 'c-badges' });
        badges.append(node('span', txt('Payment: ', 'Pago: ') + (es ? valueLabel(order.financial) : order.financial), { class: 'c-badge' + (order.financial !== 'paid' ? ' c-badge--hold' : '') }));
        holder.append(badges);
        pricedRow(holder, txt('Order total', 'Total del pedido'), order.totalMinor);
        pricedRow(holder, txt('Captured', 'Cobrado'), order.capturedMinor);
        pricedRow(holder, txt('Balance remaining', 'Saldo restante'), order.balanceMinor);
        pricedRow(holder, txt('Required before production', 'Requerido antes de producción'), Math.max(0, order.requiredMinor - order.capturedMinor));
        holder.append(node('p', txt('CRM receipt: ', 'Confirmación CRM: ') + order.sync, { class: 'c-small' }));
        holder.append(node('p', txt('Customer order notifications are not connected yet. This internal receipt is not evidence of an email or text being sent.', 'Las notificaciones del pedido aún no están conectadas. Esta confirmación interna no demuestra que se envió un correo o mensaje.'), { class: 'c-small' }));
        holder.append(node('p', txt('Payment, artwork and approval are separate requirements. Payment alone does not start production.', 'Pago, archivos y aprobación son requisitos independientes. Pagar no inicia la producción.')));
        holder.append(button(txt('Refresh authoritative status', 'Actualizar estado autorizado'), refresh, true));
        if (preview) {
            const simulate = async (path) => {
                const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) });
                if (!response.ok) throw new Error('preview_step_failed');
                await refresh();
            };
            const controls = node('div', null, { class: 'c-preview' });
            controls.append(node('p', txt('TEST CONTROLS · Simulated staff actions, not customer permissions.', 'CONTROLES DE PRUEBA · Acciones técnicas simuladas, no permisos del cliente.')),
                button(txt('Simulate staff preparation / revised proofs', 'Simular preparación técnica / pruebas nuevas'), () => simulate('/preview/proof'), true),
                button(txt('Lose next payment response (test retry)', 'Perder siguiente respuesta de pago (probar reintento)'), () => simulate('/preview/lost-payment'), true));
            holder.append(controls);
        }
        if (order.financial !== 'paid' && !order.cancelled) {
            if (!(payment?.orderId === order.id) || order.financial === 'failed') await mountPayment(holder);
            holder.append(button(order.financial === 'failed' ? txt('Start a new payment after verified failure', 'Iniciar otro pago tras fallo verificado') : payment?.orderId === order.id
                ? txt('Reconcile saved payment attempt', 'Conciliar intento de pago original')
                : txt('Pay securely', 'Pagar de forma segura'), () => pay(order.capturedMinor >= order.requiredMinor ? 'balance' : 'required')));
        } else if (order.financial === 'paid' && order.balanceMinor > 0 && !order.cancelled) {
            await mountPayment(holder);
            holder.append(button(txt('Pay remaining balance', 'Pagar saldo restante'), () => pay('balance')));
        }
        if (order.fulfillments?.length) {
            for (const f of order.fulfillments.filter(Boolean)) holder.append(node('p', txt('Fulfillment: ', 'Entrega: ') + f.method + ' · ' + f.quantity + ' · ' + (f.tracking || '')));
        }
        for (const item of order.items) {
            const article = node('article', null, { class: 'c-line', 'data-line-item': item.lineItemId });
            article.append(node('h3', item.purchased.name), node('p', statusText[item.readiness] || item.readiness, { class: 'c-badge c-badge--hold' }));
            article.append(node('p', txt('Production stage: ', 'Etapa de producción: ') + (item.stage || '—') + ' · ' + txt('Pieces: ', 'Piezas: ') + item.purchased.pieces));
            article.append(node('p', txt('Fulfilled pieces: ', 'Piezas entregadas: ') + item.fulfilledQuantity + '/' + item.purchased.pieces));
            const artworkMissing = item.purchased.productionPolicy.requiredPlacements.some((placement) =>
                item.assets.filter((a) => a.role === 'source' && a.placement === placement)
                    .reduce((n, a) => n + (a.allocatedQuantity || 0), 0) !== item.purchased.pieces);
            article.append(node('p', artworkMissing ? txt('Artwork holds production: purchased placements are not fully allocated.', 'Los archivos detienen la producción: faltan asignaciones en ubicaciones compradas.')
                : txt('Source artwork allocated; technical checks and final files are still evaluated separately.', 'Originales asignados; las verificaciones técnicas y archivos finales se evalúan por separado.'), { class: 'c-small' }));
            if (item.purchased.productionPolicy.proofRequired && item.proof?.decision !== 'approved') article.append(node('p',
                txt('Approval holds production: ', 'La aprobación detiene la producción: ')
                    + (item.proof ? valueLabel(item.proof.decision) : txt('final proof has not been issued yet.', 'aún no se emitió la prueba final.')), { class: 'c-small' }));
            for (const placement of item.purchased.productionPolicy.requiredPlacements) {
                const sources = item.assets.filter((a) => a.placement === placement && a.role === 'source');
                const covered = sources.reduce((n, a) => n + (a.allocatedQuantity || 0), 0);
                article.append(node('p', placement + ' · ' + txt('Source allocation ', 'Asignación de originales ') + covered + '/' + item.purchased.pieces));
            }
            if (!order.cancelled && !item.stageDone) {
                const form = node('form', null, { class: 'c-fields' });
                const placement = select(form, txt('Purchased placement', 'Ubicación comprada'), 'placement', item.purchased.productionPolicy.requiredPlacements.map((p) => [p, p]));
                const assignment = field(form, txt('Design assignment ID', 'ID del diseño'), 'assignment', 'text', { value: 'main', pattern: '[A-Za-z0-9_-]{1,100}', required: '', maxlength: 100 });
                const quantity = field(form, txt('Pieces using this design at this placement', 'Piezas con este diseño en esta ubicación'), 'allocation', 'number',
                    { value: item.purchased.pieces, min: 1, max: item.purchased.pieces, step: 1, required: '' });
                const file = field(form, txt('Source artwork (PNG, JPEG or PDF)', 'Archivo original (PNG, JPEG o PDF)'), 'artwork', 'file', { accept: 'image/png,image/jpeg,application/pdf', required: '' });
                const submit = node('button', txt('Upload to this purchased item', 'Subir a este artículo comprado'), { class: 'c-button', type: 'submit' });
                form.append(submit, node('p', txt('Reuse an assignment ID to replace that design. Use another ID to split quantities between designs; all allocations must total the purchased pieces for every placement.', 'Reutiliza el ID para reemplazar ese diseño. Usa otro ID para dividir cantidades entre diseños; cada ubicación debe cubrir todas las piezas compradas.'), { class: 'c-small' }));
                form.addEventListener('submit', (event) => { event.preventDefault(); run(submit, () => upload(file.files[0], item, placement.value, assignment.value, Number(quantity.value))); });
                article.append(form);
            }
            for (const asset of item.assets) article.append(node('p', [valueLabel(asset.role), asset.placement, asset.assignmentId || 'main', asset.allocatedQuantity, valueLabel(asset.state)].join(' · '), { class: 'c-small' }));
            if (item.proof) {
                article.append(node('h3', txt('Whole-item proof packet', 'Prueba completa del artículo')),
                    node('p', txt('Review EVERY final design and placement below. One decision approves this entire immutable artwork set.', 'Revisa TODOS los diseños finales y ubicaciones. Una decisión aprueba este conjunto inmutable completo.')));
                const grid = node('div', null, { class: 'c-proof-grid' }); article.append(grid);
                const finals = item.assets.filter((a) => a.role === 'final');
                let previewsReady = true;
                for (const asset of finals) {
                    const figure = node('figure'); grid.append(figure);
                    try {
                        const download = await api('download', { orderId: order.id, lineItemId: item.lineItemId, assetId: asset.assetId, preview: true });
                        const url = new URL(download.url);
                        if (url.protocol !== 'https:' && !(app.hasAttribute('data-commerce-preview') && url.origin === location.origin)) throw new Error('invalid_preview');
                        figure.append(node('img', null, { src: url.href, alt: item.purchased.name + ' Austin · ' + asset.placement + ' · ' + asset.assignmentId,
                            width: 600, height: 400, loading: 'lazy' }));
                    } catch { previewsReady = false; figure.append(node('p', txt('Preview unavailable. Refresh before approving.', 'Vista previa no disponible. Actualiza antes de aprobar.'))); }
                    figure.append(node('figcaption', asset.placement + ' · ' + (asset.assignmentId || 'main') + ' · ' + asset.allocatedQuantity
                        + (asset.assetId === item.proof.previewAssetId ? txt(' · primary preview', ' · vista principal') : '')));
                }
                article.append(node('p', txt('Proof decision: ', 'Decisión de prueba: ') + (es ? valueLabel(item.proof.decision) : item.proof.decision)));
                if (item.proof.decision === 'awaiting_review') {
                    const confirm = field(article, txt('I reviewed every final placement and allocated design in this proof packet.', 'Revisé todas las ubicaciones y diseños finales de esta prueba.'), 'proof_reviewed', 'checkbox');
                    const decide = async (decision) => {
                        const decoded = [...grid.querySelectorAll('img')];
                        if (decision === 'approved' && (!confirm.checked || !previewsReady || !finals.length
                            || decoded.length !== finals.length || decoded.some((image) => !image.complete || image.naturalWidth === 0))) {
                            announce(txt('Review all final previews and check the confirmation before approving.', 'Revisa todas las vistas finales y marca la confirmación.'), true); return;
                        }
                        const attemptId = item.proof.proofId + '_' + decision;
                        await api('decide-proof', { orderId: order.id, lineItemId: item.lineItemId, proofId: item.proof.proofId, decision }, attemptId);
                        await refresh();
                    };
                    article.append(button(txt('Approve complete proof', 'Aprobar prueba completa'), () => decide('approved')),
                        button(txt('Request changes', 'Solicitar cambios'), () => decide('changes_requested'), true));
                }
            }
            holder.append(article);
        }
        if (!publicConfiguration?.orderId) holder.append(button(txt('Reorder with current prices', 'Reordenar con precios actuales'), async () => {
            let intent = restore('canvas_commerce_reorder_v1', null);
            if (!intent || intent.orderId !== order.id || intent.expiresAt <= Date.now()) {
                intent = { orderId: order.id, requestId: uid(), expiresAt: Date.now() + 60000 };
                localStorage.setItem('canvas_commerce_reorder_v1', JSON.stringify(intent));
            }
            quote = await api('reorder', { orderId: order.id, requestId: intent.requestId }, intent.requestId);
            intent.expiresAt = quote.expiresAt; localStorage.setItem('canvas_commerce_reorder_v1', JSON.stringify(intent));
            cart = quote.items.map((item) => ({ lineItemId: item.lineItemId, productId: item.productId, configuration: item.configuration }));
            saveCart(); renderCart(); renderQuote();
            document.getElementById('commerce-checkout').scrollIntoView({ behavior: 'smooth' });
            announce(txt('Fresh prices received. This is a separate order; review and accept before any checkout/payment.', 'Precios actuales recibidos. Es otro pedido; revisa y acepta antes de comprar o pagar.'));
        }, true));
        if (!publicConfiguration?.orderId) holder.append(button(txt('Start a separate order', 'Iniciar un pedido independiente'), async () => {
            localStorage.removeItem('canvas_commerce_checkout_v1'); localStorage.removeItem('canvas_commerce_payment_v1');
            localStorage.removeItem('canvas_commerce_last_order_v1'); checkout = payment = order = null;
            sessionStorage.removeItem('canvas_commerce_checkout_payload_v1'); sessionStorage.removeItem('canvas_commerce_payment_payload_v1');
            holder.hidden = true; cart = []; saveCart(); invalidate(); renderCart();
        }, true));
    }
    document.getElementById('commerce-recovery').addEventListener('submit', (event) => {
        event.preventDefault(); run(event.submitter, async () => {
            const data = new FormData(event.currentTarget);
            await api('request-recovery', { orderId: data.get('orderId'), email: data.get('email') });
            announce(txt('If those details match, a private recovery link has been sent.', 'Si los datos coinciden, se envió un enlace privado.'));
            if (preview) {
                const mailbox = await (await fetch('/preview/mailbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
                if (mailbox.url) message.append(node('a', txt(' Open simulated private email', ' Abrir correo privado simulado'), { href: mailbox.url, class: 'c-text-link' }));
            }
        });
    });
    try {
        const recovery = new URLSearchParams(location.hash.slice(1)).get('recover');
        // Remove sensitive fragments BEFORE analytics can see page URLs.
        if (recovery) {
            history.replaceState(null, '', location.pathname);
            const result = await api('recover', { token: recovery });
            localStorage.setItem('canvas_commerce_last_order_v1', result.orderId);
            localStorage.setItem('canvas_commerce_recovered_order_v1', result.orderId);
        }
        publicConfiguration = await api('website-session', {});
        const recoveredOrder = publicConfiguration.orderId;
        if (recoveredOrder) {
            app.querySelector('.c-grid').hidden = true;
            order = await api('order', { orderId: recoveredOrder }); await renderOrder();
            announce(txt('Recovered access is limited to this order.', 'El acceso recuperado se limita a este pedido.'));
            return;
        }
        catalog = await api('catalog', {}); renderConfig(); renderCart();
        const lastOrder = localStorage.getItem('canvas_commerce_last_order_v1');
        if (lastOrder) { order = await api('order', { orderId: lastOrder }); await renderOrder(); }
        else if (checkout) {
            document.getElementById('commerce-cart').append(button(txt('Recover saved checkout request', 'Recuperar solicitud de compra guardada'), checkoutSaved, true));
        }
        announce(app.hasAttribute('data-commerce-preview')
            ? txt('ISOLATED PREVIEW · Synthetic prices, simulated payment and private test storage. No customer data or live charges.', 'VISTA AISLADA · Precios sintéticos, pago simulado y almacenamiento privado de prueba. Sin datos reales ni cobros.')
            : txt('Connected. Prices and order status come from CRM.', 'Conectado. Los precios y estados provienen del CRM.'));
    } catch (error) { announce(errorText[error.code] || error.code || error.message, true); }
};
