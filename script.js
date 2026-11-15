/* ==========================================================================
   صفحه‌ی اطلاعات پرداخت — رفتارها

   قاعده‌ی کپی شماره کارت (مهم‌ترین بخش این فایل)
   ──────────────────────────────────────────────
   • طبق استاندارد ISO/IEC 7812 شماره کارت فقط «رقم» است؛ فاصله‌ی چهار‌تا‌چهار‌تا
     صرفاً یک قرارداد نمایشی برای خواناتر شدن است و جزو شماره نیست.
   • بنابراین همیشه دقیقاً ۱۶ رقم انگلیسی (0 تا 9)، پیوسته و بدون فاصله، خط تیره
     یا نویسه‌ی نامرئی کپی می‌شود. این قالب بیشترین سازگاری را با خانه‌ی «شماره
     کارت» در اپلیکیشن‌های بانکی دارد و در خانه‌هایی که فقط ۱۶ نویسه جا دارند
     بریده نمی‌شود.
   • چرا شماره «برعکس» می‌شود؟ در متن راست‌به‌چپ، فاصله‌ی بین گروه‌ها جهت متن
     فارسی را می‌گیرد و گروه‌ها جابه‌جا دیده می‌شوند (0102 6805 9972 6037).
     رشته‌ی پیوسته‌ی ارقام هیچ فاصله‌ای ندارد و در هیچ برنامه‌ای جابه‌جا نمی‌شود.
   • در خود صفحه، شماره داخل یک ظرف چپ‌به‌راستِ ایزوله (dir="ltr") نمایش داده
     می‌شود و فاصله‌ی گروه‌ها با CSS ساخته شده است، نه با نویسه‌ی فاصله.
   • اگر کسی شماره را با دست انتخاب و کپی کند (Ctrl+C یا منوی لمسی)، همان
     خروجی تمیز را می‌گیرد.
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     پیام‌ها و زمان‌بندی
     ------------------------------------------------------------------------ */

  const MESSAGES = {
    panCopied: 'کپی شد؛ در اپلیکیشن بانک جای‌گذاری کنید.',
    detailsCopied: 'مشخصات کامل کارت کپی شد.',
    linkCopied: 'پیوند این صفحه کپی شد.',
    panFailed: 'کپی خودکار انجام نشد؛ شماره انتخاب شد، آن را دستی کپی کنید.',
    copyFailed: 'کپی خودکار در این مرورگر انجام نشد.',
  };

  const HOLD_MS = 2600;        // مدت نمایش حالت «کپی شد»
  const TOKEN_MS = 640;        // مدت پرواز هر ژتون
  const TOKEN_STAGGER_MS = 95; // فاصله‌ی زمانی بین ژتون‌ها
  const PAN_FILL_RATIO = 0.83; // سهم ارقام از عرض مفید کارت (بقیه، فاصله‌ی بین گروه‌هاست)

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');


  /* ------------------------------------------------------------------------
     ابزارهای متن و رقم
     ------------------------------------------------------------------------ */

  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  /** ارقام فارسی و عربی را به ارقام انگلیسی تبدیل می‌کند. */
  const toLatinDigits = (value) => String(value)
    .replace(/[۰-۹]/g, (digit) => PERSIAN_DIGITS.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS.indexOf(digit));

  /** فقط رقم‌ها را نگه می‌دارد: بدون فاصله، خط تیره یا نویسه‌ی نامرئی. */
  const digitsOnly = (value) => toLatinDigits(value).replace(/\D/g, '');

  const cleanText = (element) => (element ? element.textContent.replace(/\s+/g, ' ').trim() : '');

  /** الگوریتم لون: رقم کنترلی شماره کارت را می‌سنجد تا خطای تایپی پیدا شود. */
  const passesLuhn = (pan) => {
    let sum = 0;
    for (let index = 0; index < pan.length; index += 1) {
      let digit = Number(pan[pan.length - 1 - index]);
      if (index % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return pan.length > 0 && sum % 10 === 0;
  };

  const restartClass = (element, className) => {
    element.classList.remove(className);
    void element.offsetWidth; // اجرای دوباره‌ی انیمیشن
    element.classList.add(className);
  };

  const vibrate = () => {
    try {
      if (navigator.vibrate) navigator.vibrate(14);
    } catch (error) { /* لرزش اختیاری است */ }
  };


  /* ------------------------------------------------------------------------
     کپی در حافظه‌ی دستگاه
     ۱) Clipboard API (مرورگرهای امروزی، روی HTTPS و localhost)
     ۲) روش قدیمی execCommand (مرورگرهای درون‌برنامه‌ای، HTTP و نسخه‌های قدیمی)
     اگر هیچ‌کدام نشد، مقدار false برمی‌گردد تا راهنمای کپی دستی نمایش داده شود.
     ------------------------------------------------------------------------ */

  let programmaticCopy = false;

  function legacyCopy(text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.dir = 'ltr';
    field.setAttribute('aria-hidden', 'true');
    field.setAttribute('tabindex', '-1');
    // اندازه‌ی ۱۶ پیکسل جلوی بزرگ‌نمایی خودکار آیفون را می‌گیرد.
    field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;border:0;opacity:0;font-size:16px;';

    const selection = document.getSelection();
    const previousRange = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    const previousFocus = document.activeElement;

    document.body.appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);

    let succeeded = false;
    programmaticCopy = true;
    try {
      succeeded = document.execCommand('copy');
    } catch (error) {
      succeeded = false;
    }
    programmaticCopy = false;

    field.remove();
    if (selection && previousRange) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
    return succeeded;
  }

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) { /* ادامه با روش جایگزین */ }
    }
    return legacyCopy(text);
  }

  /* کپی دستی: اگر کاربر خودش شماره کارت (یا بخشی از آن) را انتخاب و کپی کند،
     فقط ارقام انگلیسی در حافظه قرار می‌گیرد. */
  document.addEventListener('copy', (event) => {
    if (programmaticCopy || !event.clipboardData) return;

    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return;

    const touchesPan = Array.from(document.querySelectorAll('[data-pan]'))
      .some((pan) => selection.containsNode(pan, true));
    if (!touchesPan) return;

    // فاصله‌ها و نویسه‌های نامرئیِ جهت‌دهی کنار گذاشته می‌شوند.
    const compact = selection.toString().replace(/[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
    if (!/^[0-9۰-۹٠-٩]+$/.test(compact)) return; // انتخاب، چیزی فراتر از شماره است

    event.clipboardData.setData('text/plain', toLatinDigits(compact));
    event.preventDefault();
  });


  /* ------------------------------------------------------------------------
     ژتون‌های طلایی: «رونوشت» هر گروه از روی کارت بلند می‌شود و در دکمه می‌نشیند.
     شماره‌ی روی کارت در تمام مدت ثابت و خوانا می‌ماند.
     ------------------------------------------------------------------------ */

  function flyTokens(groups, target) {
    const layer = document.createElement('div');
    layer.className = 'token-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    const targetRect = target.getBoundingClientRect();
    const toX = targetRect.left + targetRect.width / 2;
    const toY = targetRect.top + targetRect.height / 2;
    const fontSize = window.getComputedStyle(groups[0]).fontSize;

    groups.forEach((group, index) => {
      const rect = group.getBoundingClientRect();
      const fromX = rect.left + rect.width / 2;
      const fromY = rect.top + rect.height / 2;

      const token = document.createElement('span');
      token.className = 'token';
      token.style.fontSize = fontSize;

      const chip = document.createElement('span');
      chip.className = 'token__chip';
      chip.textContent = group.textContent;

      token.appendChild(chip);
      layer.appendChild(token);

      const timing = { duration: TOKEN_MS, delay: index * TOKEN_STAGGER_MS, fill: 'both' };
      const at = (x) => `translate(${x}px, ${fromY}px) translate(-50%, -50%)`;

      // حرکت افقی زودتر و حرکت عمودی دیرتر شتاب می‌گیرد تا مسیر، قوسی و طبیعی باشد.
      token.animate([
        { transform: at(fromX), offset: 0 },
        { transform: at(fromX), offset: 0.14, easing: 'cubic-bezier(.3, .6, .4, 1)' },
        { transform: at(toX), offset: 0.9 },
        { transform: at(toX), offset: 1 },
      ], timing);

      chip.animate([
        { transform: 'translateY(0) scale(.92)', opacity: 0, easing: 'cubic-bezier(.22, 1, .36, 1)' },
        { transform: 'translateY(-.6em) scale(1.06)', opacity: 1, offset: 0.24, easing: 'cubic-bezier(.6, 0, .9, .4)' },
        { transform: `translateY(${toY - fromY}px) scale(.4)`, opacity: 1, offset: 0.9, easing: 'linear' },
        { transform: `translateY(${toY - fromY}px) scale(.18)`, opacity: 0 },
      ], timing);
    });

    const total = TOKEN_MS + (groups.length - 1) * TOKEN_STAGGER_MS;
    window.setTimeout(() => layer.remove(), total + 80);

    return TOKEN_MS * 0.9; // لحظه‌ی نشستن نخستین ژتون
  }


  /* ------------------------------------------------------------------------
     هر بخش «کارت + دکمه‌ها» مستقل راه‌اندازی می‌شود؛
     پس با کپی‌کردن section.pay در HTML می‌توان کارت دیگری هم افزود.
     ------------------------------------------------------------------------ */

  function initPay(root) {
    const card = root.querySelector('[data-card]');
    const cardBody = card ? card.querySelector('.card__body') : null;
    const panElement = root.querySelector('[data-pan]');
    const copyButton = root.querySelector('[data-action="copy-pan"]');
    const detailsButton = root.querySelector('[data-action="copy-details"]');
    const shareButton = root.querySelector('[data-action="share"]');
    const statusElement = root.querySelector('[data-status]');
    const liveElement = root.querySelector('[data-live]');
    if (!card || !cardBody || !panElement) return;

    const pan = digitsOnly(panElement.textContent);
    const holder = cleanText(root.querySelector('[data-holder]'));
    const bank = cleanText(root.querySelector('[data-bank]'));
    const owner = cleanText(document.querySelector('[data-owner]'));
    const idleStatus = statusElement ? statusElement.textContent : '';

    if (pan.length !== 16 || !passesLuhn(pan)) {
      console.warn(`[payment-page] شماره کارت «${pan}» معتبر به نظر نمی‌رسد؛ لطفاً ارقام را در index.html بازبینی کنید.`);
    }

    /* ---- بازسازی استاندارد شماره: گروه‌های چهارتایی و یک span برای هر رقم ---- */

    const chunks = pan.match(/.{1,4}/g) || [];
    panElement.textContent = '';
    let digitIndex = 0;
    const groups = chunks.map((chunk) => {
      const group = document.createElement('span');
      group.className = 'pan__group';
      Array.from(chunk).forEach((character) => {
        const digit = document.createElement('span');
        digit.className = 'pan__digit';
        digit.style.setProperty('--i', String(digitIndex));
        digit.textContent = character;
        group.appendChild(digit);
        digitIndex += 1;
      });
      panElement.appendChild(group);
      return group;
    });

    // صفحه‌خوان‌ها شماره را رقم‌به‌رقم می‌خوانند، نه به شکل یک عدد چند‌هزار میلیاردی.
    const spoken = root.querySelector('[data-pan-sr]');
    if (spoken) {
      spoken.textContent = `شماره کارت: ${chunks.map((chunk) => Array.from(chunk).join(' ')).join('، ')}`;
      panElement.setAttribute('aria-hidden', 'true');
    }

    /* ---- تناسب شماره با عرض کارت، مستقل از پهنای ارقام هر فونت ---- */

    const digits = Array.from(panElement.querySelectorAll('.pan__digit'));
    const usedWidth = (element) => parseFloat(window.getComputedStyle(element).width) || 0;
    const digitsWidth = () => digits.reduce((sum, digit) => sum + usedWidth(digit), 0);

    panElement.classList.add('is-built');

    const fitPan = () => {
      panElement.style.removeProperty('--pan-fit');
      const target = usedWidth(panElement) * PAN_FILL_RATIO;
      let current = digitsWidth();
      if (!target || !current) return;

      // دو گام: پهنای ارقام در برخی سیستم‌ها دقیقاً متناسب با اندازه‌ی فونت تغییر نمی‌کند.
      let fit = 1;
      for (let pass = 0; pass < 2; pass += 1) {
        fit = Math.min(1.3, Math.max(0.6, fit * (target / current)));
        panElement.style.setProperty('--pan-fit', fit.toFixed(3));
        current = digitsWidth();
      }
    };

    fitPan();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitPan);
      if (typeof document.fonts.addEventListener === 'function') {
        document.fonts.addEventListener('loadingdone', fitPan);
      }
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(fitPan).observe(card);
    } else {
      window.addEventListener('resize', fitPan);
    }

    /* ---- خط وضعیت و اعلان برای صفحه‌خوان ---- */

    let statusTimer = 0;

    const setStatus = (tone, message, hold = HOLD_MS) => {
      window.clearTimeout(statusTimer);
      if (statusElement) {
        statusElement.dataset.tone = tone;
        statusElement.textContent = message;
        if (tone !== 'idle') restartClass(statusElement, 'is-fresh');
      }
      if (tone === 'idle') return;
      if (liveElement) {
        liveElement.textContent = '';
        window.setTimeout(() => { liveElement.textContent = message; }, 60);
      }
      statusTimer = window.setTimeout(() => setStatus('idle', idleStatus), hold);
    };

    const flashTimers = new WeakMap();

    const flashDone = (button) => {
      window.clearTimeout(flashTimers.get(button));
      button.dataset.state = 'done';
      flashTimers.set(button, window.setTimeout(() => { button.dataset.state = 'idle'; }, HOLD_MS));
    };

    /* ---- کپی شماره کارت ---- */

    let holdTimer = 0;
    let playing = false;

    const reset = () => {
      if (copyButton) copyButton.dataset.state = 'idle';
      card.classList.remove('is-copied');
    };

    const settle = () => {
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(reset, HOLD_MS);
    };

    const showDone = () => {
      if (!copyButton) return;
      const icon = copyButton.querySelector('.btn__icon');
      if (icon) {
        // پر شدن رنگ دکمه از همان نقطه‌ای آغاز می‌شود که ژتون‌ها می‌نشینند.
        const buttonRect = copyButton.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        copyButton.style.setProperty('--fx', `${iconRect.left + iconRect.width / 2 - buttonRect.left}px`);
      }
      copyButton.dataset.state = 'done';
    };

    const celebrate = () => {
      if (playing) return;
      card.classList.add('is-copied');

      const alreadyDone = copyButton && copyButton.dataset.state === 'done';
      const target = copyButton ? copyButton.querySelector('.btn__icon') : null;
      const canAnimate = !reducedMotion.matches && target && typeof target.animate === 'function';

      if (alreadyDone || !canAnimate) {
        showDone();
        settle();
        return;
      }

      playing = true;
      window.clearTimeout(holdTimer);
      restartClass(card, 'is-sheen');
      restartClass(panElement, 'is-wave');

      const landing = flyTokens(groups, target);

      window.setTimeout(() => {
        showDone();
        target.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
          { duration: 360, easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
        );
      }, landing);

      window.setTimeout(() => {
        playing = false;
        panElement.classList.remove('is-wave');
        settle();
      }, landing + 420);
    };

    const selectPan = () => {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(panElement);
      selection.removeAllRanges();
      selection.addRange(range);
    };

    const copyPan = async () => {
      const copied = await copyText(pan);
      if (!copied) {
        selectPan();
        setStatus('error', MESSAGES.panFailed, 7000);
        if (copyButton) restartClass(copyButton, 'is-shake');
        return;
      }
      vibrate();
      setStatus('success', MESSAGES.panCopied, HOLD_MS + 900);
      celebrate();
    };

    if (copyButton) copyButton.addEventListener('click', copyPan);
    card.classList.add('is-ready');

    // کلیک روی خود کارت هم شماره را کپی می‌کند؛ مگر وقتی کاربر در حال انتخاب دستی ارقام است.
    cardBody.addEventListener('click', () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.containsNode(panElement, true)) return;
      copyPan();
    });

    /* ---- کپی همه‌ی مشخصات ---- */

    const detailsText = [
      owner ? `اطلاعات پرداخت ${owner}` : '',
      `شماره کارت: ${pan}`,
      holder ? `به نام: ${holder}` : '',
      bank,
    ].filter(Boolean).join('\n');

    if (detailsButton) {
      detailsButton.addEventListener('click', async () => {
        if (await copyText(detailsText)) {
          flashDone(detailsButton);
          setStatus('success', MESSAGES.detailsCopied);
        } else {
          setStatus('error', MESSAGES.copyFailed, 5000);
          restartClass(detailsButton, 'is-shake');
        }
      });
    }

    /* ---- اشتراک‌گذاری: پنجره‌ی اشتراک دستگاه؛ اگر در دسترس نبود، کپی پیوند ---- */

    if (shareButton) {
      shareButton.addEventListener('click', async () => {
        const url = window.location.href.split('#')[0];

        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({ title: document.title, text: detailsText, url });
            return;
          } catch (error) {
            if (error && error.name === 'AbortError') return; // کاربر پنجره را بست
          }
        }

        if (await copyText(url)) {
          flashDone(shareButton);
          setStatus('success', MESSAGES.linkCopied);
        } else {
          setStatus('error', MESSAGES.copyFailed, 5000);
          restartClass(shareButton, 'is-shake');
        }
      });
    }

    /* ---- کج شدن سه‌بعدی کارت با حرکت نشانگر (فقط دسکتاپ) ---- */

    if (finePointer.matches && !reducedMotion.matches) {
      let frame = 0;
      let pointerX = 0;
      let pointerY = 0;

      const applyTilt = () => {
        frame = 0;
        const rect = card.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (pointerX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (pointerY - rect.top) / rect.height));
        cardBody.style.setProperty('--ry', `${((x - 0.5) * 11).toFixed(2)}deg`);
        cardBody.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`);
        cardBody.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
        cardBody.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      };

      cardBody.addEventListener('pointermove', (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        card.classList.add('is-tilting');
        if (!frame) frame = window.requestAnimationFrame(applyTilt);
      });

      cardBody.addEventListener('pointerleave', () => {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        card.classList.remove('is-tilting');
        cardBody.style.removeProperty('--rx');
        cardBody.style.removeProperty('--ry');
      });
    }
  }


  /* ------------------------------------------------------------------------
     راه‌اندازی
     ------------------------------------------------------------------------ */

  document.querySelectorAll('[data-pay]').forEach(initPay);

  // نام صاحب حساب فقط یک‌جا (روی کارت) نوشته می‌شود و بقیه‌ی صفحه از همان‌جا به‌روز می‌شود.
  const holders = Array.from(document.querySelectorAll('[data-holder]'))
    .map(cleanText)
    .filter((name, index, list) => name && list.indexOf(name) === index);

  if (holders.length) {
    document.querySelectorAll('[data-holder-echo]').forEach((element) => {
      element.textContent = holders.join('» یا «');
    });
  }
})();
