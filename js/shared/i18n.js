/**
 * Internationalisation module for BipolarBear.
 *
 * Exposes:
 *   BB.t(key, vars)            — translate a dot-notation key, optional {var} replacements
 *   BB.i18n.setLanguage(code)  — change language, persist to localStorage, re-apply DOM
 *   BB.i18n.applyAll()         — walk DOM for data-i18n* attributes and apply translations
 *   BB.i18n.getLang()          — return current language code
 *   BB.i18n.getLanguages()     — return [{code, name}] list
 *   BB.i18n.showPicker(cb)     — show full-screen language picker overlay
 *
 * HTML attributes processed by applyAll():
 *   data-i18n="key"            → sets textContent
 *   data-i18n-html="key"       → sets innerHTML
 *   data-i18n-placeholder="key"→ sets placeholder
 *   data-i18n-title="key"      → sets title
 *
 * localStorage key: bbLanguage
 *
 * @file js/shared/i18n.js
 */
(function () {
  'use strict';

  // ── Locale data ───────────────────────────────────────────────────────────

  var _locales = {

    en: {
      common: {
        save: 'Save', cancel: 'Cancel', close: 'Close', edit: 'Edit',
        delete: 'Delete', add: 'Add', back: 'Back', next: 'Next',
        previous: 'Previous', loading: 'Loading…', gotIt: 'Got it',
        signIn: 'Sign In', signOut: 'Sign Out', signUp: 'Sign Up',
        skip: 'Skip for now', send: 'Send', continue: 'Continue',
        remove: 'Remove', keep: 'Keep', confirm: 'Confirm',
      },
      nav: {
        journal: 'Mood Journal',
        survivalKit: 'Your Survival Kit',
        anonymous: 'Bipolar Anonymous',
      },
      home: {
        signInNote: 'Sign in to join the community',
        logoHint: '🐻 psst… click me!',
        journalHint: '🐻 Click here to get started!',
        survivalHint: '🐻 Click here to learn and share more about your bipolar',
        signinHintLabel: '🐻 Save your progress here',
        signinHintStored: 'Stored securely in Firebase',
        madeBy: 'Being built by James Markey',
        features: {
          insightsTitle: 'Visual Insights',
          insightsDesc: 'See your mood patterns over time with charts',
          privateTitle: 'Private & Secure',
          privateDesc: 'Your data stays safe with you',
          trackTitle: 'Stay On Track',
          trackDesc: 'Build healthy habits with streaks',
        },
        wa: {
          title: 'Join Bipolar Anonymous',
          body: 'Would you like to join our WhatsApp group Bipolar Anonymous?',
          join: '✅ Join Group',
          cancel: 'Cancel',
          hide: '🙈 Hide this button',
        },
        whatsNew: { gotIt: 'Got it', changelog: 'Full changelog ↗' },
      },
      pd: {
        title: '👤 Personal Details',
        subtitle: 'All fields optional. Appears on exported PDF reports for your healthcare provider.',
        name: 'Name',
        dob: 'Date of Birth (e.g. 15 Jan 1990)',
        medNum: 'Medical # / NHS Number',
        diagnosis: 'Diagnosed as (e.g. Bipolar I, Bipolar II)',
        diagDate: 'Diagnosis Date (e.g. March 2020)',
        address: 'Address',
        mobile: 'Mobile Number',
        email: 'Email',
        emergency: 'Emergency Contact (name & number)',
        notes: 'Notes (optional)',
      },
      pin: {
        title: 'Enter your PIN to continue',
        moreInfo: '🔐 More info',
        whyTitle: '🔐 Why is there a PIN?',
        forgot: 'Forgot PIN?',
        tapToWake: 'Tap to wake',
        incorrect: 'Incorrect PIN. Try again.',
        gotIt: 'Got it',
      },
      auth: {
        welcome: 'Welcome to Bipolar Bear 🐻',
        noAccount: "Don't have an account?",
        hasAccount: 'Already have an account?',
        signUpLink: 'Sign up',
        continueGuest: 'Continue as Guest',
      },
      account: {
        signOut: 'Sign out',
        changePassword: 'Change password',
        changeEmail: 'Change email',
        currentPassword: 'Current password',
        newPassword: 'New password',
        newEmail: 'New email address',
        cancel: 'Cancel',
        language: 'Language',
      },
      i18n: {
        chooseLang: 'Choose your language',
        continue: 'Continue',
      },
      mood: {
        manic: 'Manic', elevated: 'Elevated', good: 'Good',
        low: 'Low', depressed: 'Depressed',
      },
      anon: {
        verify: {
          back: '← Home',
          welcome: 'Welcome 👋',
          sub: "Verify your email to join the community. Your identity stays private — we'll never share it.",
          sendCode: 'Send Verification Code',
          verify: 'Verify →',
          changeEmail: '← Change email',
          resend: 'Resend code',
        },
        monika: {
          verified: 'Email Verified!',
          chooseSub: 'Now choose your <strong>Monika</strong> — your anonymous community name. Max 10 characters.',
          postPreview: 'Your posts will look like this',
          btn: "That's me →",
          placeholder: 'e.g. SunnyDaze',
        },
        meds: {
          title: 'Medication Visibility',
          sub: 'Would you like to show your current medication alongside your posts? You can change this anytime in settings.',
          yesLabel: 'Yes, show my medication',
          yesSub: 'Others can see your current med — helps people feel less alone',
          noLabel: 'No, keep it private',
          noSub: 'Only your Monika & streak will show',
        },
        medDefine: {
          title: 'Your Medication',
          sub: 'Add your current medications. Only the name will be visible on posts — dosage stays private.',
          namePlaceholder: 'Medication name',
          dosePlaceholder: 'Dosage (optional)',
          addBtn: '+ Add',
          continueBtn: 'Continue →',
          skipBtn: 'Skip for now',
        },
        board: {
          announcements: '📢 Announcements',
          general: '💬 General',
          loading: 'Loading posts…',
          empty: 'No posts yet — be the first!',
        },
        compose: {
          placeholder: 'Share with the community…',
          cancel: 'Cancel',
          post: 'Post 🐻',
        },
        firstPost: {
          title: 'Thanks for posting!',
          sub: 'Your post is now live for the community. Keep being you 💛',
          awesome: 'Awesome 🐻',
          close: 'Close',
        },
        sos: {
          title: 'Send SOS Flag',
          body: 'Are you worried about this user? A moderator will be notified to check in. Only use this if genuinely concerned.',
          cancel: 'Cancel',
          confirm: 'Send SOS 🆘',
        },
        report: {
          title: 'Report this post?',
          why: 'Why are you reporting this?',
          unkind: 'Unkind or rude',
          misinfo: 'Misinformation',
          spam: 'Spam',
          other: 'Other concern',
          note: 'Bans are temporary — everyone deserves another chance 💛',
        },
        e2ee: {
          title: 'End-to-End Encrypted',
          sub: 'BipolarBear Anonymous is built with your privacy at its core:',
          messagesTitle: 'Messages are encrypted',
          messagesSub: 'Only community members can read posts — no third parties, ever.',
          identityTitle: 'No identity stored',
          identitySub: 'Your email is verified then discarded. Your Monika is all we hold.',
          noSellTitle: 'Zero data selling',
          noSellSub: 'We will never sell, share or monetise your data.',
          secureTitle: 'Secure by design',
          secureSub: 'Built on industry-standard encryption protocols from the ground up.',
          gotIt: 'Got it 👍',
        },
        monikaSettings: {
          title: 'Your Monika',
          monikaName: 'Monika Name',
          initials: 'Initials (2 letters, leave blank for auto)',
          initialsPlaceholder: 'Auto',
          color: 'Avatar Colour',
          preview: 'Preview',
          medication: 'Medication',
          stability: 'Stability Counter',
          loading: 'Loading…',
          cancel: 'Cancel',
          save: 'Save Changes ✓',
          back: '← Back to Bipolar Bear',
          signOut: 'Sign Out',
        },
        medOv: {
          title: 'Your Medication',
          visibility: 'Visibility on posts',
          showOnPosts: '✅ Show on posts',
          private: '🔒 Private',
          yourMeds: 'Your Medications',
          namePlaceholder: 'Medication name',
          dosePlaceholder: 'Dosage (optional)',
          add: '+ Add',
          bbNote: "💡 You're signed in to BipolarBear — saving will also update your medication in the main app.",
          cancel: 'Cancel',
          save: 'Save ✓',
        },
        stableOv: {
          title: 'Stability Counter',
          visibility: 'Visibility on posts',
          showOnPosts: '✅ Show on posts',
          private: '🔒 Private',
          stableDays: '{n} consecutive stable days',
          bbAuto: 'Automatically calculated from your BipolarBear journal — consecutive days where you logged Stable mood up to your most recent entry.',
          stableSince: 'Stable since',
          stableSinceDesc: 'Enter the date your current stable period started. Your counter will show days since that date.',
          cancel: 'Cancel',
          save: 'Save ✓',
        },
        selfDelete: {
          title: 'Remove your post?',
          sub: "This will permanently delete your post. This can't be undone.",
          keep: 'Keep it',
          remove: 'Remove post',
        },
        adminDelete: {
          title: 'Delete Post?',
          sub: 'This post will be replaced with "deleted by admin" and can\'t be undone.',
          cancel: 'Cancel',
          delete: 'Delete 🗑️',
        },
        about: {
          subtitle: 'A safe space for people living with bipolar',
          body: 'This is an anonymous peer community for people living with bipolar disorder. You join with a chosen name — your real identity is never stored or shared.',
          guidelinesTitle: 'Community guidelines',
          poweredTitle: 'Powered by BipolarBear',
          poweredBody: 'BipolarBear is a free mood journal and survival kit for people with bipolar disorder — track mood, energy, sleep and medication daily.',
          discover: '🐻 Discover BipolarBear →',
          close: 'Close',
        },
      },
      journal: {
        hint: {
          goBack: '🐻 Go back here',
          openEntries: '🐻 Click to open your past entries and statistics',
          closeJournal: '🐻 Close the journal again here',
          clickHere: '🐻 Click here',
          chooseMood: '🐻 Choose a mood to get started',
          tapHold: '🐻 👆 Tap & Hold a mood to learn more',
          logMed: '🐻 Log your medication here',
          closeToContinue: '🐻 Close to continue',
          privateMode: "Private mode on — this entry won't appear on your medical record PDF",
          favourite: 'Marked as a favourite — find it anytime in All-Time Stats',
          tutorialDone: "Advanced tutorial complete. You're all set now!",
        },
        btn: { openJournal: '📔 Open Journal', closeJournal: '📕 Close Journal' },
        prompt: {
          howFallback: 'How did you feel?',
          howToday: 'How is today going?',
          howYesterday: 'How was yesterday?',
          howDate: 'How was {date}?',
          viewTodayEntry: "View today's entry",
          viewYesterdayEntry: "View yesterday's entry",
        },
        nav: { home: '← Home' },
      },
    },

    es: {
      common: {
        save: 'Guardar', cancel: 'Cancelar', close: 'Cerrar', edit: 'Editar',
        delete: 'Eliminar', add: 'Agregar', back: 'Atrás', next: 'Siguiente',
        previous: 'Anterior', loading: 'Cargando…', gotIt: 'Entendido',
        signIn: 'Iniciar sesión', signOut: 'Cerrar sesión', signUp: 'Registrarse',
        skip: 'Omitir por ahora', send: 'Enviar', continue: 'Continuar',
        remove: 'Eliminar', keep: 'Conservar', confirm: 'Confirmar',
      },
      nav: {
        journal: 'Diario de Ánimo',
        survivalKit: 'Tu Kit de Supervivencia',
        anonymous: 'Bipolar Anonymous',
      },
      home: {
        signInNote: 'Inicia sesión para unirte a la comunidad',
        logoHint: '🐻 psst… ¡haz clic en mí!',
        journalHint: '🐻 ¡Haz clic aquí para comenzar!',
        survivalHint: '🐻 Haz clic aquí para aprender y compartir más sobre tu bipolar',
        signinHintLabel: '🐻 Guarda tu progreso aquí',
        signinHintStored: 'Almacenado de forma segura en Firebase',
        madeBy: 'Creado por James Markey',
        features: {
          insightsTitle: 'Información Visual',
          insightsDesc: 'Ve tus patrones de ánimo con gráficos',
          privateTitle: 'Privado y Seguro',
          privateDesc: 'Tus datos están seguros contigo',
          trackTitle: 'Mantente en el Buen Camino',
          trackDesc: 'Construye hábitos saludables con rachas',
        },
        wa: {
          title: 'Únete a Bipolar Anonymous',
          body: '¿Te gustaría unirte a nuestro grupo de WhatsApp Bipolar Anonymous?',
          join: '✅ Unirse al Grupo',
          cancel: 'Cancelar',
          hide: '🙈 Ocultar este botón',
        },
        whatsNew: { gotIt: 'Entendido', changelog: 'Registro completo ↗' },
      },
      pd: {
        title: '👤 Datos Personales',
        subtitle: 'Todos los campos son opcionales. Aparece en los informes PDF exportados para su proveedor de salud.',
        name: 'Nombre',
        dob: 'Fecha de Nacimiento (p.ej. 15 Ene 1990)',
        medNum: 'Número Médico / Seguridad Social',
        diagnosis: 'Diagnosticado como (p.ej. Bipolar I, Bipolar II)',
        diagDate: 'Fecha de Diagnóstico (p.ej. Marzo 2020)',
        address: 'Dirección',
        mobile: 'Número de Móvil',
        email: 'Correo electrónico',
        emergency: 'Contacto de Emergencia (nombre y número)',
        notes: 'Notas (opcional)',
      },
      pin: {
        title: 'Introduce tu PIN para continuar',
        moreInfo: '🔐 Más información',
        whyTitle: '🔐 ¿Por qué hay un PIN?',
        forgot: '¿Olvidaste tu PIN?',
        tapToWake: 'Toca para despertar',
        incorrect: 'PIN incorrecto. Inténtalo de nuevo.',
        gotIt: 'Entendido',
      },
      auth: {
        welcome: 'Bienvenido a Bipolar Bear 🐻',
        noAccount: '¿No tienes cuenta?',
        hasAccount: '¿Ya tienes cuenta?',
        signUpLink: 'Regístrate',
        continueGuest: 'Continuar como Invitado',
      },
      account: {
        signOut: 'Cerrar sesión', changePassword: 'Cambiar contraseña',
        changeEmail: 'Cambiar correo', currentPassword: 'Contraseña actual',
        newPassword: 'Nueva contraseña', newEmail: 'Nueva dirección de correo',
        cancel: 'Cancelar', language: 'Idioma',
      },
      i18n: { chooseLang: 'Elige tu idioma', continue: 'Continuar' },
      mood: { manic: 'Maníaco', elevated: 'Elevado', good: 'Bien', low: 'Bajo', depressed: 'Deprimido' },
      anon: {
        verify: { back: '← Inicio', welcome: '¡Bienvenido! 👋', sub: 'Verifica tu correo para unirte a la comunidad. Tu identidad es privada.', sendCode: 'Enviar Código de Verificación', verify: 'Verificar →', changeEmail: '← Cambiar correo', resend: 'Reenviar código' },
        monika: { verified: '¡Correo Verificado!', chooseSub: 'Ahora elige tu <strong>Monika</strong> — tu nombre anónimo. Máx. 10 caracteres.', postPreview: 'Así se verán tus publicaciones', btn: 'Ese soy yo →', placeholder: 'p.ej. SunnyDaze' },
        meds: { title: 'Visibilidad de Medicación', sub: '¿Deseas mostrar tu medicación actual junto a tus publicaciones?', yesLabel: 'Sí, mostrar mi medicación', yesSub: 'Otros pueden ver tu medicación — ayuda a sentirse menos solo', noLabel: 'No, mantenerlo privado', noSub: 'Solo se mostrará tu Monika y racha' },
        medDefine: { title: 'Tu Medicación', sub: 'Agrega tus medicamentos actuales. Solo el nombre será visible.', namePlaceholder: 'Nombre del medicamento', dosePlaceholder: 'Dosis (opcional)', addBtn: '+ Agregar', continueBtn: 'Continuar →', skipBtn: 'Omitir por ahora' },
        board: { announcements: '📢 Anuncios', general: '💬 General', loading: 'Cargando publicaciones…', empty: 'Aún no hay publicaciones — ¡sé el primero!' },
        compose: { placeholder: 'Comparte con la comunidad…', cancel: 'Cancelar', post: 'Publicar 🐻' },
        firstPost: { title: '¡Gracias por publicar!', sub: 'Tu publicación está en vivo. Sigue siendo tú 💛', awesome: '¡Genial! 🐻', close: 'Cerrar' },
        sos: { title: 'Enviar Señal de SOS', body: '¿Estás preocupado por este usuario? Un moderador será notificado. Úsalo solo si estás genuinamente preocupado.', cancel: 'Cancelar', confirm: 'Enviar SOS 🆘' },
        report: { title: '¿Denunciar esta publicación?', why: '¿Por qué la denuncias?', unkind: 'Malintencionado o grosero', misinfo: 'Desinformación', spam: 'Spam', other: 'Otra preocupación', note: 'Los baneos son temporales — todos merecen otra oportunidad 💛' },
        e2ee: { title: 'Cifrado de Extremo a Extremo', sub: 'BipolarBear Anonymous está construido con tu privacidad como núcleo:', messagesTitle: 'Los mensajes están cifrados', messagesSub: 'Solo los miembros de la comunidad pueden leer — nunca terceros.', identityTitle: 'Ninguna identidad almacenada', identitySub: 'Tu correo se verifica y luego se descarta. Tu Monika es todo lo que guardamos.', noSellTitle: 'Cero venta de datos', noSellSub: 'Nunca venderemos, compartiremos o monetizaremos tus datos.', secureTitle: 'Seguro por diseño', secureSub: 'Construido sobre protocolos de cifrado estándar desde cero.', gotIt: 'Entendido 👍' },
        monikaSettings: { title: 'Tu Monika', monikaName: 'Nombre Monika', initials: 'Iniciales (2 letras, vacío para auto)', initialsPlaceholder: 'Auto', color: 'Color de Avatar', preview: 'Vista previa', medication: 'Medicación', stability: 'Contador de Estabilidad', loading: 'Cargando…', cancel: 'Cancelar', save: 'Guardar Cambios ✓', back: '← Volver a Bipolar Bear', signOut: 'Cerrar Sesión' },
        medOv: { title: 'Tu Medicación', visibility: 'Visibilidad en publicaciones', showOnPosts: '✅ Mostrar en publicaciones', private: '🔒 Privado', yourMeds: 'Tus Medicamentos', namePlaceholder: 'Nombre del medicamento', dosePlaceholder: 'Dosis (opcional)', add: '+ Agregar', bbNote: '💡 Has iniciado sesión en BipolarBear — guardar también actualizará tu medicación.', cancel: 'Cancelar', save: 'Guardar ✓' },
        stableOv: { title: 'Contador de Estabilidad', visibility: 'Visibilidad en publicaciones', showOnPosts: '✅ Mostrar en publicaciones', private: '🔒 Privado', stableDays: '{n} días estables consecutivos', bbAuto: 'Calculado automáticamente desde tu diario de BipolarBear.', stableSince: 'Estable desde', stableSinceDesc: 'Introduce la fecha en que comenzó tu período estable actual.', cancel: 'Cancelar', save: 'Guardar ✓' },
        selfDelete: { title: '¿Eliminar tu publicación?', sub: 'Esto eliminará permanentemente tu publicación. No se puede deshacer.', keep: 'Conservarla', remove: 'Eliminar publicación' },
        adminDelete: { title: '¿Eliminar Publicación?', sub: 'Esta publicación será reemplazada con "eliminado por admin".', cancel: 'Cancelar', delete: 'Eliminar 🗑️' },
        about: { subtitle: 'Un espacio seguro para personas con bipolar', body: 'Esta es una comunidad anónima para personas con trastorno bipolar.', guidelinesTitle: 'Normas de la comunidad', poweredTitle: 'Desarrollado por BipolarBear', poweredBody: 'BipolarBear es un diario de ánimo gratuito para personas con trastorno bipolar.', discover: '🐻 Descubrir BipolarBear →', close: 'Cerrar' },
      },
      journal: {
        hint: {
          goBack: '🐻 Vuelve aquí',
          openEntries: '🐻 Haz clic para abrir tus entradas pasadas y estadísticas',
          closeJournal: '🐻 Cierra el diario aquí',
          clickHere: '🐻 Haz clic aquí',
          chooseMood: '🐻 Elige un estado de ánimo para comenzar',
          tapHold: '🐻 👆 Mantén presionado un estado de ánimo para más info',
          logMed: '🐻 Registra tu medicación aquí',
          closeToContinue: '🐻 Cierra para continuar',
          privateMode: 'Modo privado activado — esta entrada no aparecerá en tu PDF médico',
          favourite: 'Marcado como favorito — encuéntralo en Estadísticas de Todos los Tiempos',
          tutorialDone: '¡Tutorial avanzado completado. ¡Todo listo!',
        },
        btn: { openJournal: '📔 Abrir Diario', closeJournal: '📕 Cerrar Diario' },
        prompt: {
          howFallback: '¿Cómo te sentiste?',
          howToday: '¿Cómo va el día?',
          howYesterday: '¿Cómo fue ayer?',
          howDate: '¿Cómo fue el {date}?',
          viewTodayEntry: 'Ver la entrada de hoy',
          viewYesterdayEntry: 'Ver la entrada de ayer',
        },
        nav: { home: '← Inicio' },
      },
    },

    fr: {
      common: {
        save: 'Enregistrer', cancel: 'Annuler', close: 'Fermer', edit: 'Modifier',
        delete: 'Supprimer', add: 'Ajouter', back: 'Retour', next: 'Suivant',
        previous: 'Précédent', loading: 'Chargement…', gotIt: 'Compris',
        signIn: 'Se connecter', signOut: 'Se déconnecter', signUp: "S'inscrire",
        skip: 'Ignorer pour l\'instant', send: 'Envoyer', continue: 'Continuer',
        remove: 'Supprimer', keep: 'Conserver', confirm: 'Confirmer',
      },
      nav: { journal: "Journal d'Humeur", survivalKit: 'Votre Kit de Survie', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: 'Connectez-vous pour rejoindre la communauté',
        logoHint: '🐻 psst… cliquez sur moi !',
        journalHint: '🐻 Cliquez ici pour commencer !',
        survivalHint: '🐻 Cliquez ici pour en savoir plus sur votre bipolarité',
        signinHintLabel: '🐻 Sauvegardez votre progression ici',
        signinHintStored: 'Stocké en toute sécurité sur Firebase',
        madeBy: 'Développé par James Markey',
        features: { insightsTitle: 'Aperçus Visuels', insightsDesc: 'Visualisez vos tendances d\'humeur avec des graphiques', privateTitle: 'Privé et Sécurisé', privateDesc: 'Vos données restent en sécurité', trackTitle: 'Restez sur la Bonne Voie', trackDesc: 'Créez de bonnes habitudes avec des séries' },
        wa: { title: 'Rejoindre Bipolar Anonymous', body: 'Souhaitez-vous rejoindre notre groupe WhatsApp Bipolar Anonymous ?', join: '✅ Rejoindre le Groupe', cancel: 'Annuler', hide: '🙈 Masquer ce bouton' },
        whatsNew: { gotIt: 'Compris', changelog: 'Journal complet ↗' },
      },
      pd: { title: '👤 Informations Personnelles', subtitle: 'Tous les champs sont facultatifs. Apparaît sur les rapports PDF exportés pour votre professionnel de santé.', name: 'Nom', dob: 'Date de naissance (p.ex. 15 Jan 1990)', medNum: 'Numéro médical', diagnosis: 'Diagnostiqué comme (p.ex. Bipolaire I, Bipolaire II)', diagDate: 'Date du diagnostic (p.ex. Mars 2020)', address: 'Adresse', mobile: 'Numéro de portable', email: 'E-mail', emergency: "Contact d'urgence (nom et numéro)", notes: 'Notes (facultatif)' },
      pin: { title: 'Entrez votre PIN pour continuer', moreInfo: '🔐 Plus d\'infos', whyTitle: '🔐 Pourquoi y a-t-il un PIN ?', forgot: 'PIN oublié ?', tapToWake: 'Appuyer pour réveiller', incorrect: 'PIN incorrect. Réessayez.', gotIt: 'Compris' },
      auth: { welcome: 'Bienvenue sur Bipolar Bear 🐻', noAccount: 'Pas de compte ?', hasAccount: 'Déjà un compte ?', signUpLink: "S'inscrire", continueGuest: 'Continuer en tant qu\'invité' },
      account: { signOut: 'Se déconnecter', changePassword: 'Changer le mot de passe', changeEmail: "Changer l'e-mail", currentPassword: 'Mot de passe actuel', newPassword: 'Nouveau mot de passe', newEmail: 'Nouvelle adresse e-mail', cancel: 'Annuler', language: 'Langue' },
      i18n: { chooseLang: 'Choisissez votre langue', continue: 'Continuer' },
      mood: { manic: 'Maniaque', elevated: 'Élevé', good: 'Bien', low: 'Bas', depressed: 'Déprimé' },
      anon: {
        verify: { back: '← Accueil', welcome: 'Bienvenue 👋', sub: 'Vérifiez votre e-mail pour rejoindre la communauté. Votre identité reste privée.', sendCode: 'Envoyer le code de vérification', verify: 'Vérifier →', changeEmail: "← Changer l'e-mail", resend: 'Renvoyer le code' },
        monika: { verified: 'E-mail Vérifié !', chooseSub: 'Choisissez maintenant votre <strong>Monika</strong> — votre nom anonyme. Max. 10 caractères.', postPreview: 'Vos posts ressembleront à ceci', btn: "C'est moi →", placeholder: 'ex. SunnyDaze' },
        meds: { title: 'Visibilité des Médicaments', sub: 'Souhaitez-vous afficher votre médicament actuel avec vos posts ?', yesLabel: 'Oui, afficher mes médicaments', yesSub: 'Les autres voient votre médicament — aide à se sentir moins seul', noLabel: 'Non, garder privé', noSub: 'Seuls votre Monika et série seront affichés' },
        medDefine: { title: 'Vos Médicaments', sub: 'Ajoutez vos médicaments actuels. Seul le nom sera visible.', namePlaceholder: 'Nom du médicament', dosePlaceholder: 'Dosage (facultatif)', addBtn: '+ Ajouter', continueBtn: 'Continuer →', skipBtn: 'Ignorer pour l\'instant' },
        board: { announcements: '📢 Annonces', general: '💬 Général', loading: 'Chargement des publications…', empty: 'Aucun post pour l\'instant — soyez le premier !' },
        compose: { placeholder: 'Partagez avec la communauté…', cancel: 'Annuler', post: 'Publier 🐻' },
        firstPost: { title: 'Merci d\'avoir posté !', sub: 'Votre post est maintenant en ligne. Restez vous-même 💛', awesome: 'Super ! 🐻', close: 'Fermer' },
        sos: { title: 'Envoyer un signal SOS', body: 'Êtes-vous inquiet pour cet utilisateur ? Un modérateur sera averti. Utilisez ceci seulement si vous êtes vraiment inquiet.', cancel: 'Annuler', confirm: 'Envoyer SOS 🆘' },
        report: { title: 'Signaler ce post ?', why: 'Pourquoi signalez-vous ceci ?', unkind: 'Méchant ou impoli', misinfo: 'Désinformation', spam: 'Spam', other: 'Autre préoccupation', note: 'Les bans sont temporaires — tout le monde mérite une autre chance 💛' },
        e2ee: { title: 'Chiffrement de Bout en Bout', sub: 'BipolarBear Anonymous est construit avec votre vie privée au cœur :', messagesTitle: 'Les messages sont chiffrés', messagesSub: 'Seuls les membres de la communauté peuvent lire les posts — jamais des tiers.', identityTitle: 'Aucune identité stockée', identitySub: 'Votre e-mail est vérifié puis supprimé. Votre Monika est tout ce que nous conservons.', noSellTitle: 'Zéro vente de données', noSellSub: 'Nous ne vendrons, partagerons ni monétiserons jamais vos données.', secureTitle: 'Sécurisé par conception', secureSub: 'Construit sur des protocoles de chiffrement standard depuis le début.', gotIt: 'Compris 👍' },
        monikaSettings: { title: 'Votre Monika', monikaName: 'Nom Monika', initials: 'Initiales (2 lettres, laisser vide pour auto)', initialsPlaceholder: 'Auto', color: "Couleur d'Avatar", preview: 'Aperçu', medication: 'Médicaments', stability: 'Compteur de Stabilité', loading: 'Chargement…', cancel: 'Annuler', save: 'Enregistrer ✓', back: '← Retour à Bipolar Bear', signOut: 'Se Déconnecter' },
        medOv: { title: 'Vos Médicaments', visibility: 'Visibilité sur les posts', showOnPosts: '✅ Afficher sur les posts', private: '🔒 Privé', yourMeds: 'Vos Médicaments', namePlaceholder: 'Nom du médicament', dosePlaceholder: 'Dosage (facultatif)', add: '+ Ajouter', bbNote: '💡 Vous êtes connecté à BipolarBear — sauvegarder mettra à jour votre médicament.', cancel: 'Annuler', save: 'Enregistrer ✓' },
        stableOv: { title: 'Compteur de Stabilité', visibility: 'Visibilité sur les posts', showOnPosts: '✅ Afficher sur les posts', private: '🔒 Privé', stableDays: '{n} jours stables consécutifs', bbAuto: 'Calculé automatiquement depuis votre journal BipolarBear.', stableSince: 'Stable depuis', stableSinceDesc: 'Entrez la date de début de votre période stable actuelle.', cancel: 'Annuler', save: 'Enregistrer ✓' },
        selfDelete: { title: 'Supprimer votre post ?', sub: 'Cela supprimera définitivement votre post. Impossible à annuler.', keep: 'Conserver', remove: 'Supprimer le post' },
        adminDelete: { title: 'Supprimer le Post ?', sub: 'Ce post sera remplacé par "supprimé par admin".', cancel: 'Annuler', delete: 'Supprimer 🗑️' },
        about: { subtitle: 'Un espace sûr pour les personnes bipolaires', body: 'Une communauté anonyme pour les personnes avec un trouble bipolaire.', guidelinesTitle: 'Règles de la communauté', poweredTitle: 'Propulsé par BipolarBear', poweredBody: 'BipolarBear est un journal d\'humeur gratuit pour les personnes bipolaires.', discover: '🐻 Découvrir BipolarBear →', close: 'Fermer' },
      },
      journal: {
        hint: {
          goBack: '🐻 Revenez ici',
          openEntries: '🐻 Cliquez pour ouvrir vos entrées passées et statistiques',
          closeJournal: '🐻 Refermez le journal ici',
          clickHere: '🐻 Cliquez ici',
          chooseMood: '🐻 Choisissez une humeur pour commencer',
          tapHold: '🐻 👆 Appuyez et maintenez une humeur pour en savoir plus',
          logMed: '🐻 Notez vos médicaments ici',
          closeToContinue: '🐻 Fermez pour continuer',
          privateMode: "Mode privé activé — cette entrée n'apparaîtra pas sur votre PDF médical",
          favourite: 'Marqué comme favori — retrouvez-le dans les Statistiques Globales',
          tutorialDone: 'Tutoriel avancé terminé. Vous êtes prêt !',
        },
        btn: { openJournal: '📔 Ouvrir le Journal', closeJournal: '📕 Fermer le Journal' },
        prompt: {
          howFallback: 'Comment vous êtes-vous senti·e ?',
          howToday: 'Comment se passe la journée ?',
          howYesterday: "Comment s'est passée hier ?",
          howDate: "Comment s'est passé le {date} ?",
          viewTodayEntry: "Voir l'entrée d'aujourd'hui",
          viewYesterdayEntry: "Voir l'entrée d'hier",
        },
        nav: { home: '← Accueil' },
      },
    },

    de: {
      common: {
        save: 'Speichern', cancel: 'Abbrechen', close: 'Schließen', edit: 'Bearbeiten',
        delete: 'Löschen', add: 'Hinzufügen', back: 'Zurück', next: 'Weiter',
        previous: 'Zurück', loading: 'Laden…', gotIt: 'Verstanden',
        signIn: 'Anmelden', signOut: 'Abmelden', signUp: 'Registrieren',
        skip: 'Jetzt überspringen', send: 'Senden', continue: 'Weiter',
        remove: 'Entfernen', keep: 'Behalten', confirm: 'Bestätigen',
      },
      nav: { journal: 'Stimmungstagebuch', survivalKit: 'Ihr Überlebenskit', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: 'Anmelden, um der Community beizutreten',
        logoHint: '🐻 psst… klick mich!',
        journalHint: '🐻 Hier klicken, um zu beginnen!',
        survivalHint: '🐻 Klicken Sie hier, um mehr über Ihre Bipolarität zu erfahren',
        signinHintLabel: '🐻 Speichern Sie Ihren Fortschritt hier',
        signinHintStored: 'Sicher in Firebase gespeichert',
        madeBy: 'Entwickelt von James Markey',
        features: { insightsTitle: 'Visuelle Einblicke', insightsDesc: 'Sehen Sie Ihre Stimmungsmuster mit Diagrammen', privateTitle: 'Privat & Sicher', privateDesc: 'Ihre Daten bleiben sicher bei Ihnen', trackTitle: 'Bleiben Sie auf Kurs', trackDesc: 'Bauen Sie gesunde Gewohnheiten auf' },
        wa: { title: 'Bipolar Anonymous beitreten', body: 'Möchten Sie unserer WhatsApp-Gruppe Bipolar Anonymous beitreten?', join: '✅ Gruppe beitreten', cancel: 'Abbrechen', hide: '🙈 Schaltfläche ausblenden' },
        whatsNew: { gotIt: 'Verstanden', changelog: 'Vollständiges Protokoll ↗' },
      },
      pd: { title: '👤 Persönliche Daten', subtitle: 'Alle Felder optional. Erscheint in exportierten PDF-Berichten für Ihren Arzt.', name: 'Name', dob: 'Geburtsdatum (z.B. 15. Jan. 1990)', medNum: 'Krankenversicherungsnummer', diagnosis: 'Diagnostiziert als (z.B. Bipolar I, Bipolar II)', diagDate: 'Diagnosedatum (z.B. März 2020)', address: 'Adresse', mobile: 'Handynummer', email: 'E-Mail', emergency: 'Notfallkontakt (Name und Nummer)', notes: 'Notizen (optional)' },
      pin: { title: 'PIN eingeben, um fortzufahren', moreInfo: '🔐 Mehr Info', whyTitle: '🔐 Warum gibt es einen PIN?', forgot: 'PIN vergessen?', tapToWake: 'Tippen zum Aufwecken', incorrect: 'Falscher PIN. Versuchen Sie es erneut.', gotIt: 'Verstanden' },
      auth: { welcome: 'Willkommen bei Bipolar Bear 🐻', noAccount: 'Kein Konto?', hasAccount: 'Schon ein Konto?', signUpLink: 'Registrieren', continueGuest: 'Als Gast fortfahren' },
      account: { signOut: 'Abmelden', changePassword: 'Passwort ändern', changeEmail: 'E-Mail ändern', currentPassword: 'Aktuelles Passwort', newPassword: 'Neues Passwort', newEmail: 'Neue E-Mail-Adresse', cancel: 'Abbrechen', language: 'Sprache' },
      i18n: { chooseLang: 'Wählen Sie Ihre Sprache', continue: 'Weiter' },
      mood: { manic: 'Manisch', elevated: 'Gehoben', good: 'Gut', low: 'Niedrig', depressed: 'Deprimiert' },
      anon: {
        verify: { back: '← Startseite', welcome: 'Willkommen 👋', sub: 'Bestätigen Sie Ihre E-Mail. Ihre Identität bleibt privat.', sendCode: 'Bestätigungscode senden', verify: 'Bestätigen →', changeEmail: '← E-Mail ändern', resend: 'Code erneut senden' },
        monika: { verified: 'E-Mail Bestätigt!', chooseSub: 'Wählen Sie Ihren <strong>Monika</strong> — Ihren anonymen Namen. Max. 10 Zeichen.', postPreview: 'So werden Ihre Beiträge aussehen', btn: 'Das bin ich →', placeholder: 'z.B. SunnyDaze' },
        meds: { title: 'Medikamenten-Sichtbarkeit', sub: 'Möchten Sie Ihre aktuellen Medikamente neben Ihren Beiträgen anzeigen?', yesLabel: 'Ja, meine Medikamente anzeigen', yesSub: 'Andere können Ihre Medikamente sehen — hilft weniger allein zu fühlen', noLabel: 'Nein, privat halten', noSub: 'Nur Ihre Monika und Streak werden angezeigt' },
        medDefine: { title: 'Ihre Medikamente', sub: 'Fügen Sie Ihre aktuellen Medikamente hinzu. Nur der Name wird sichtbar sein.', namePlaceholder: 'Medikamentenname', dosePlaceholder: 'Dosierung (optional)', addBtn: '+ Hinzufügen', continueBtn: 'Weiter →', skipBtn: 'Jetzt überspringen' },
        board: { announcements: '📢 Ankündigungen', general: '💬 Allgemein', loading: 'Beiträge werden geladen…', empty: 'Noch keine Beiträge — sei der Erste!' },
        compose: { placeholder: 'Mit der Community teilen…', cancel: 'Abbrechen', post: 'Posten 🐻' },
        firstPost: { title: 'Danke fürs Posten!', sub: 'Ihr Beitrag ist jetzt live. Bleiben Sie Sie selbst 💛', awesome: 'Super! 🐻', close: 'Schließen' },
        sos: { title: 'SOS-Signal senden', body: 'Sind Sie besorgt um diesen Benutzer? Ein Moderator wird benachrichtigt. Nur verwenden, wenn wirklich besorgt.', cancel: 'Abbrechen', confirm: 'SOS senden 🆘' },
        report: { title: 'Diesen Beitrag melden?', why: 'Warum melden Sie dies?', unkind: 'Unfreundlich oder unhöflich', misinfo: 'Fehlinformation', spam: 'Spam', other: 'Andere Bedenken', note: 'Sperren sind vorübergehend — jeder verdient eine weitere Chance 💛' },
        e2ee: { title: 'Ende-zu-Ende Verschlüsselt', sub: 'BipolarBear Anonymous wurde mit Datenschutz als Grundlage entwickelt:', messagesTitle: 'Nachrichten sind verschlüsselt', messagesSub: 'Nur Community-Mitglieder können Beiträge lesen — keine Dritten.', identityTitle: 'Keine Identität gespeichert', identitySub: 'Ihre E-Mail wird verifiziert und dann verworfen. Ihre Monika ist alles, was wir speichern.', noSellTitle: 'Kein Datenverkauf', noSellSub: 'Wir werden Ihre Daten niemals verkaufen, teilen oder monetarisieren.', secureTitle: 'Sicher durch Design', secureSub: 'Von Grund auf mit branchenüblichen Verschlüsselungsprotokollen aufgebaut.', gotIt: 'Verstanden 👍' },
        monikaSettings: { title: 'Ihre Monika', monikaName: 'Monika-Name', initials: 'Initialen (2 Buchstaben, leer für auto)', initialsPlaceholder: 'Auto', color: 'Avatar-Farbe', preview: 'Vorschau', medication: 'Medikamente', stability: 'Stabilitätszähler', loading: 'Laden…', cancel: 'Abbrechen', save: 'Änderungen speichern ✓', back: '← Zurück zu Bipolar Bear', signOut: 'Abmelden' },
        medOv: { title: 'Ihre Medikamente', visibility: 'Sichtbarkeit in Beiträgen', showOnPosts: '✅ In Beiträgen anzeigen', private: '🔒 Privat', yourMeds: 'Ihre Medikamente', namePlaceholder: 'Medikamentenname', dosePlaceholder: 'Dosierung (optional)', add: '+ Hinzufügen', bbNote: '💡 Sie sind bei BipolarBear angemeldet — Speichern aktualisiert auch Ihre Medikamente.', cancel: 'Abbrechen', save: 'Speichern ✓' },
        stableOv: { title: 'Stabilitätszähler', visibility: 'Sichtbarkeit in Beiträgen', showOnPosts: '✅ In Beiträgen anzeigen', private: '🔒 Privat', stableDays: '{n} aufeinanderfolgende stabile Tage', bbAuto: 'Automatisch aus Ihrem BipolarBear-Tagebuch berechnet.', stableSince: 'Stabil seit', stableSinceDesc: 'Geben Sie das Startdatum Ihrer aktuellen stabilen Phase ein.', cancel: 'Abbrechen', save: 'Speichern ✓' },
        selfDelete: { title: 'Ihren Beitrag entfernen?', sub: 'Dies löscht Ihren Beitrag dauerhaft. Kann nicht rückgängig gemacht werden.', keep: 'Behalten', remove: 'Beitrag entfernen' },
        adminDelete: { title: 'Beitrag löschen?', sub: 'Dieser Beitrag wird durch "von Admin gelöscht" ersetzt.', cancel: 'Abbrechen', delete: 'Löschen 🗑️' },
        about: { subtitle: 'Ein sicherer Ort für Menschen mit Bipolar', body: 'Eine anonyme Community für Menschen mit bipolarer Störung.', guidelinesTitle: 'Community-Richtlinien', poweredTitle: 'Powered by BipolarBear', poweredBody: 'BipolarBear ist ein kostenloses Stimmungstagebuch für Menschen mit bipolarer Störung.', discover: '🐻 BipolarBear entdecken →', close: 'Schließen' },
      },
      journal: {
        hint: {
          goBack: '🐻 Hier zurückgehen',
          openEntries: '🐻 Klicken Sie, um vergangene Einträge und Statistiken zu öffnen',
          closeJournal: '🐻 Das Tagebuch hier wieder schließen',
          clickHere: '🐻 Hier klicken',
          chooseMood: '🐻 Wählen Sie eine Stimmung, um zu beginnen',
          tapHold: '🐻 👆 Tippen und halten Sie eine Stimmung für mehr Infos',
          logMed: '🐻 Hier Medikamente eintragen',
          closeToContinue: '🐻 Schließen, um fortzufahren',
          privateMode: 'Privater Modus aktiv — dieser Eintrag erscheint nicht in Ihrem Arzt-PDF',
          favourite: 'Als Favorit markiert — jederzeit in den Gesamtstatistiken zu finden',
          tutorialDone: 'Erweitertes Tutorial abgeschlossen. Alles bereit!',
        },
        btn: { openJournal: '📔 Tagebuch öffnen', closeJournal: '📕 Tagebuch schließen' },
        prompt: {
          howFallback: 'Wie haben Sie sich gefühlt?',
          howToday: 'Wie läuft der Tag?',
          howYesterday: 'Wie war gestern?',
          howDate: 'Wie war der {date}?',
          viewTodayEntry: 'Heutigen Eintrag ansehen',
          viewYesterdayEntry: 'Gestrigen Eintrag ansehen',
        },
        nav: { home: '← Startseite' },
      },
    },

    it: {
      common: {
        save: 'Salva', cancel: 'Annulla', close: 'Chiudi', edit: 'Modifica',
        delete: 'Elimina', add: 'Aggiungi', back: 'Indietro', next: 'Avanti',
        previous: 'Precedente', loading: 'Caricamento…', gotIt: 'Capito',
        signIn: 'Accedi', signOut: 'Esci', signUp: 'Registrati',
        skip: 'Salta per ora', send: 'Invia', continue: 'Continua',
        remove: 'Rimuovi', keep: 'Mantieni', confirm: 'Conferma',
      },
      nav: { journal: "Diario dell'Umore", survivalKit: 'Il Tuo Kit di Sopravvivenza', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: 'Accedi per unirti alla comunità',
        logoHint: '🐻 psst… cliccami!',
        journalHint: '🐻 Clicca qui per iniziare!',
        survivalHint: '🐻 Clicca qui per saperne di più sulla tua bipolarità',
        signinHintLabel: '🐻 Salva i tuoi progressi qui',
        signinHintStored: 'Archiviato in modo sicuro su Firebase',
        madeBy: 'Sviluppato da James Markey',
        features: { insightsTitle: 'Approfondimenti Visivi', insightsDesc: 'Vedi i tuoi schemi d\'umore nel tempo con grafici', privateTitle: 'Privato e Sicuro', privateDesc: 'I tuoi dati rimangono al sicuro con te', trackTitle: 'Rimani in Carreggiata', trackDesc: 'Costruisci abitudini sane con le serie' },
        wa: { title: 'Unisciti a Bipolar Anonymous', body: 'Vorresti unirti al nostro gruppo WhatsApp Bipolar Anonymous?', join: '✅ Unisciti al Gruppo', cancel: 'Annulla', hide: '🙈 Nascondi questo pulsante' },
        whatsNew: { gotIt: 'Capito', changelog: 'Registro completo ↗' },
      },
      pd: { title: '👤 Dati Personali', subtitle: 'Tutti i campi sono facoltativi. Appare nei rapporti PDF esportati per il tuo operatore sanitario.', name: 'Nome', dob: 'Data di nascita (es. 15 Gen 1990)', medNum: 'Numero Tessera Sanitaria', diagnosis: 'Diagnosticato come (es. Bipolare I, Bipolare II)', diagDate: 'Data della diagnosi (es. Marzo 2020)', address: 'Indirizzo', mobile: 'Numero di cellulare', email: 'Email', emergency: 'Contatto di emergenza (nome e numero)', notes: 'Note (opzionale)' },
      pin: { title: 'Inserisci il tuo PIN per continuare', moreInfo: '🔐 Più info', whyTitle: '🔐 Perché c\'è un PIN?', forgot: 'PIN dimenticato?', tapToWake: 'Tocca per svegliare', incorrect: 'PIN non corretto. Riprova.', gotIt: 'Capito' },
      auth: { welcome: 'Benvenuto su Bipolar Bear 🐻', noAccount: 'Non hai un account?', hasAccount: 'Hai già un account?', signUpLink: 'Registrati', continueGuest: 'Continua come ospite' },
      account: { signOut: 'Esci', changePassword: 'Cambia password', changeEmail: 'Cambia email', currentPassword: 'Password attuale', newPassword: 'Nuova password', newEmail: 'Nuovo indirizzo email', cancel: 'Annulla', language: 'Lingua' },
      i18n: { chooseLang: 'Scegli la tua lingua', continue: 'Continua' },
      mood: { manic: 'Maniacale', elevated: 'Elevato', good: 'Bene', low: 'Basso', depressed: 'Depresso' },
      anon: {
        verify: { back: '← Home', welcome: 'Benvenuto 👋', sub: 'Verifica la tua email per unirti alla comunità. La tua identità rimane privata.', sendCode: 'Invia codice di verifica', verify: 'Verifica →', changeEmail: '← Cambia email', resend: 'Invia di nuovo il codice' },
        monika: { verified: 'Email Verificata!', chooseSub: 'Ora scegli il tuo <strong>Monika</strong> — il tuo nome anonimo. Max 10 caratteri.', postPreview: 'I tuoi post appariranno così', btn: 'Sono io →', placeholder: 'es. SunnyDaze' },
        meds: { title: 'Visibilità Farmaci', sub: 'Vuoi mostrare il tuo farmaco attuale accanto ai tuoi post?', yesLabel: 'Sì, mostra i miei farmaci', yesSub: 'Gli altri possono vedere il tuo farmaco — aiuta a sentirsi meno soli', noLabel: 'No, tieni privato', noSub: 'Veranno mostrati solo il tuo Monika e la serie' },
        medDefine: { title: 'I Tuoi Farmaci', sub: 'Aggiungi i tuoi farmaci attuali. Solo il nome sarà visibile.', namePlaceholder: 'Nome del farmaco', dosePlaceholder: 'Dosaggio (opzionale)', addBtn: '+ Aggiungi', continueBtn: 'Continua →', skipBtn: 'Salta per ora' },
        board: { announcements: '📢 Annunci', general: '💬 Generale', loading: 'Caricamento post…', empty: 'Nessun post ancora — sii il primo!' },
        compose: { placeholder: 'Condividi con la comunità…', cancel: 'Annulla', post: 'Pubblica 🐻' },
        firstPost: { title: 'Grazie per aver pubblicato!', sub: 'Il tuo post è ora live per la comunità. Continua ad essere te stesso 💛', awesome: 'Fantastico! 🐻', close: 'Chiudi' },
        sos: { title: 'Invia segnale SOS', body: 'Sei preoccupato per questo utente? Un moderatore verrà avvisato. Usalo solo se sei genuinamente preoccupato.', cancel: 'Annulla', confirm: 'Invia SOS 🆘' },
        report: { title: 'Segnalare questo post?', why: 'Perché lo stai segnalando?', unkind: 'Scortese o maleducato', misinfo: 'Disinformazione', spam: 'Spam', other: 'Altra preoccupazione', note: 'I ban sono temporanei — tutti meritano un\'altra possibilità 💛' },
        e2ee: { title: 'Crittografia End-to-End', sub: 'BipolarBear Anonymous è costruito con la tua privacy al centro:', messagesTitle: 'I messaggi sono crittografati', messagesSub: 'Solo i membri della comunità possono leggere i post — mai terze parti.', identityTitle: 'Nessuna identità memorizzata', identitySub: 'La tua email viene verificata e poi scartata. Il tuo Monika è tutto ciò che conserviamo.', noSellTitle: 'Nessuna vendita di dati', noSellSub: 'Non venderemo, condivideremo o monetizzeremo mai i tuoi dati.', secureTitle: 'Sicuro per design', secureSub: 'Costruito su protocolli di crittografia standard del settore dall\'inizio.', gotIt: 'Capito 👍' },
        monikaSettings: { title: 'Il Tuo Monika', monikaName: 'Nome Monika', initials: 'Iniziali (2 lettere, vuoto per auto)', initialsPlaceholder: 'Auto', color: 'Colore Avatar', preview: 'Anteprima', medication: 'Farmaci', stability: 'Contatore di Stabilità', loading: 'Caricamento…', cancel: 'Annulla', save: 'Salva modifiche ✓', back: '← Torna a Bipolar Bear', signOut: 'Esci' },
        medOv: { title: 'I Tuoi Farmaci', visibility: 'Visibilità sui post', showOnPosts: '✅ Mostra sui post', private: '🔒 Privato', yourMeds: 'I Tuoi Farmaci', namePlaceholder: 'Nome del farmaco', dosePlaceholder: 'Dosaggio (opzionale)', add: '+ Aggiungi', bbNote: '💡 Sei connesso a BipolarBear — salvare aggiornerà anche il tuo farmaco.', cancel: 'Annulla', save: 'Salva ✓' },
        stableOv: { title: 'Contatore di Stabilità', visibility: 'Visibilità sui post', showOnPosts: '✅ Mostra sui post', private: '🔒 Privato', stableDays: '{n} giorni stabili consecutivi', bbAuto: 'Calcolato automaticamente dal tuo diario BipolarBear.', stableSince: 'Stabile da', stableSinceDesc: 'Inserisci la data di inizio del tuo attuale periodo stabile.', cancel: 'Annulla', save: 'Salva ✓' },
        selfDelete: { title: 'Rimuovere il tuo post?', sub: 'Questo eliminerà definitivamente il tuo post. Non può essere annullato.', keep: 'Tienilo', remove: 'Rimuovi post' },
        adminDelete: { title: 'Eliminare il Post?', sub: 'Questo post sarà sostituito con "eliminato dall\'admin".', cancel: 'Annulla', delete: 'Elimina 🗑️' },
        about: { subtitle: 'Uno spazio sicuro per le persone con bipolare', body: 'Una comunità anonima per persone con disturbo bipolare.', guidelinesTitle: 'Linee guida della comunità', poweredTitle: 'Powered by BipolarBear', poweredBody: 'BipolarBear è un diario dell\'umore gratuito per persone con disturbo bipolare.', discover: '🐻 Scopri BipolarBear →', close: 'Chiudi' },
      },
      journal: {
        hint: {
          goBack: '🐻 Torna qui',
          openEntries: '🐻 Clicca per aprire le tue voci passate e statistiche',
          closeJournal: '🐻 Chiudi di nuovo il diario qui',
          clickHere: '🐻 Clicca qui',
          chooseMood: '🐻 Scegli un umore per iniziare',
          tapHold: '🐻 👆 Tieni premuto un umore per saperne di più',
          logMed: '🐻 Registra la tua terapia qui',
          closeToContinue: '🐻 Chiudi per continuare',
          privateMode: 'Modalità privata attiva — questa voce non apparirà nel tuo PDF medico',
          favourite: 'Segnato come preferito — trovalo nelle Statistiche Totali',
          tutorialDone: 'Tutorial avanzato completato. Sei pronto!',
        },
        btn: { openJournal: '📔 Apri Diario', closeJournal: '📕 Chiudi Diario' },
        prompt: {
          howFallback: 'Come ti sei sentito?',
          howToday: "Com'è andata oggi?",
          howYesterday: "Com'è andata ieri?",
          howDate: "Com'è andata il {date}?",
          viewTodayEntry: 'Visualizza la voce di oggi',
          viewYesterdayEntry: 'Visualizza la voce di ieri',
        },
        nav: { home: '← Home' },
      },
    },

    pt: {
      common: {
        save: 'Salvar', cancel: 'Cancelar', close: 'Fechar', edit: 'Editar',
        delete: 'Excluir', add: 'Adicionar', back: 'Voltar', next: 'Próximo',
        previous: 'Anterior', loading: 'Carregando…', gotIt: 'Entendi',
        signIn: 'Entrar', signOut: 'Sair', signUp: 'Cadastrar',
        skip: 'Pular por agora', send: 'Enviar', continue: 'Continuar',
        remove: 'Remover', keep: 'Manter', confirm: 'Confirmar',
      },
      nav: { journal: 'Diário de Humor', survivalKit: 'Seu Kit de Sobrevivência', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: 'Faça login para entrar na comunidade',
        logoHint: '🐻 psst… clique em mim!',
        journalHint: '🐻 Clique aqui para começar!',
        survivalHint: '🐻 Clique aqui para aprender mais sobre seu bipolar',
        signinHintLabel: '🐻 Salve seu progresso aqui',
        signinHintStored: 'Armazenado com segurança no Firebase',
        madeBy: 'Desenvolvido por James Markey',
        features: { insightsTitle: 'Insights Visuais', insightsDesc: 'Veja seus padrões de humor com gráficos', privateTitle: 'Privado e Seguro', privateDesc: 'Seus dados ficam seguros com você', trackTitle: 'Fique no Caminho Certo', trackDesc: 'Construa hábitos saudáveis com sequências' },
        wa: { title: 'Entrar no Bipolar Anonymous', body: 'Gostaria de entrar no nosso grupo do WhatsApp Bipolar Anonymous?', join: '✅ Entrar no Grupo', cancel: 'Cancelar', hide: '🙈 Ocultar este botão' },
        whatsNew: { gotIt: 'Entendi', changelog: 'Registro completo ↗' },
      },
      pd: { title: '👤 Dados Pessoais', subtitle: 'Todos os campos são opcionais. Aparece nos relatórios PDF exportados para seu prestador de saúde.', name: 'Nome', dob: 'Data de Nascimento (ex. 15 Jan 1990)', medNum: 'Número do SUS / Prontuário', diagnosis: 'Diagnosticado como (ex. Bipolar I, Bipolar II)', diagDate: 'Data do Diagnóstico (ex. Março 2020)', address: 'Endereço', mobile: 'Número de Celular', email: 'E-mail', emergency: 'Contato de Emergência (nome e número)', notes: 'Notas (opcional)' },
      pin: { title: 'Digite seu PIN para continuar', moreInfo: '🔐 Mais informações', whyTitle: '🔐 Por que há um PIN?', forgot: 'Esqueceu o PIN?', tapToWake: 'Toque para acordar', incorrect: 'PIN incorreto. Tente novamente.', gotIt: 'Entendi' },
      auth: { welcome: 'Bem-vindo ao Bipolar Bear 🐻', noAccount: 'Não tem uma conta?', hasAccount: 'Já tem uma conta?', signUpLink: 'Cadastre-se', continueGuest: 'Continuar como Convidado' },
      account: { signOut: 'Sair', changePassword: 'Alterar senha', changeEmail: 'Alterar e-mail', currentPassword: 'Senha atual', newPassword: 'Nova senha', newEmail: 'Novo endereço de e-mail', cancel: 'Cancelar', language: 'Idioma' },
      i18n: { chooseLang: 'Escolha o seu idioma', continue: 'Continuar' },
      mood: { manic: 'Maníaco', elevated: 'Elevado', good: 'Bem', low: 'Baixo', depressed: 'Deprimido' },
      anon: {
        verify: { back: '← Início', welcome: 'Bem-vindo 👋', sub: 'Verifique seu e-mail para entrar na comunidade. Sua identidade é privada.', sendCode: 'Enviar Código de Verificação', verify: 'Verificar →', changeEmail: '← Alterar e-mail', resend: 'Reenviar código' },
        monika: { verified: 'E-mail Verificado!', chooseSub: 'Agora escolha seu <strong>Monika</strong> — seu nome anônimo. Máx. 10 caracteres.', postPreview: 'Suas publicações ficarão assim', btn: 'Sou eu →', placeholder: 'ex. SunnyDaze' },
        meds: { title: 'Visibilidade de Medicação', sub: 'Deseja mostrar sua medicação atual junto às suas publicações?', yesLabel: 'Sim, mostrar minha medicação', yesSub: 'Outros podem ver sua medicação — ajuda a sentir-se menos sozinho', noLabel: 'Não, manter privado', noSub: 'Apenas seu Monika e sequência serão mostrados' },
        medDefine: { title: 'Sua Medicação', sub: 'Adicione seus medicamentos atuais. Apenas o nome será visível.', namePlaceholder: 'Nome do medicamento', dosePlaceholder: 'Dosagem (opcional)', addBtn: '+ Adicionar', continueBtn: 'Continuar →', skipBtn: 'Pular por agora' },
        board: { announcements: '📢 Anúncios', general: '💬 Geral', loading: 'Carregando publicações…', empty: 'Nenhuma publicação ainda — seja o primeiro!' },
        compose: { placeholder: 'Compartilhe com a comunidade…', cancel: 'Cancelar', post: 'Publicar 🐻' },
        firstPost: { title: 'Obrigado por publicar!', sub: 'Sua publicação está ao vivo. Continue sendo você 💛', awesome: 'Incrível! 🐻', close: 'Fechar' },
        sos: { title: 'Enviar Sinal SOS', body: 'Está preocupado com este usuário? Um moderador será notificado. Use apenas se genuinamente preocupado.', cancel: 'Cancelar', confirm: 'Enviar SOS 🆘' },
        report: { title: 'Denunciar esta publicação?', why: 'Por que você está denunciando?', unkind: 'Desrespeitoso ou rude', misinfo: 'Desinformação', spam: 'Spam', other: 'Outra preocupação', note: 'Os banimentos são temporários — todos merecem outra chance 💛' },
        e2ee: { title: 'Criptografado de Ponta a Ponta', sub: 'BipolarBear Anonymous é construído com sua privacidade como núcleo:', messagesTitle: 'Mensagens são criptografadas', messagesSub: 'Apenas membros da comunidade podem ler as publicações — nunca terceiros.', identityTitle: 'Nenhuma identidade armazenada', identitySub: 'Seu e-mail é verificado e descartado. Seu Monika é tudo o que guardamos.', noSellTitle: 'Zero venda de dados', noSellSub: 'Nunca venderemos, compartilharemos ou monetizaremos seus dados.', secureTitle: 'Seguro por design', secureSub: 'Construído sobre protocolos de criptografia padrão do setor desde o início.', gotIt: 'Entendi 👍' },
        monikaSettings: { title: 'Seu Monika', monikaName: 'Nome Monika', initials: 'Iniciais (2 letras, vazio para auto)', initialsPlaceholder: 'Auto', color: 'Cor do Avatar', preview: 'Pré-visualização', medication: 'Medicação', stability: 'Contador de Estabilidade', loading: 'Carregando…', cancel: 'Cancelar', save: 'Salvar Alterações ✓', back: '← Voltar ao Bipolar Bear', signOut: 'Sair' },
        medOv: { title: 'Sua Medicação', visibility: 'Visibilidade nas publicações', showOnPosts: '✅ Mostrar nas publicações', private: '🔒 Privado', yourMeds: 'Seus Medicamentos', namePlaceholder: 'Nome do medicamento', dosePlaceholder: 'Dosagem (opcional)', add: '+ Adicionar', bbNote: '💡 Você está conectado ao BipolarBear — salvar também atualizará sua medicação.', cancel: 'Cancelar', save: 'Salvar ✓' },
        stableOv: { title: 'Contador de Estabilidade', visibility: 'Visibilidade nas publicações', showOnPosts: '✅ Mostrar nas publicações', private: '🔒 Privado', stableDays: '{n} dias estáveis consecutivos', bbAuto: 'Calculado automaticamente do seu diário BipolarBear.', stableSince: 'Estável desde', stableSinceDesc: 'Insira a data de início do seu período estável atual.', cancel: 'Cancelar', save: 'Salvar ✓' },
        selfDelete: { title: 'Remover sua publicação?', sub: 'Isso excluirá permanentemente sua publicação. Não pode ser desfeito.', keep: 'Manter', remove: 'Remover publicação' },
        adminDelete: { title: 'Excluir Publicação?', sub: 'Esta publicação será substituída por "excluído pelo admin".', cancel: 'Cancelar', delete: 'Excluir 🗑️' },
        about: { subtitle: 'Um espaço seguro para pessoas com transtorno bipolar', body: 'Uma comunidade anônima para pessoas com transtorno bipolar.', guidelinesTitle: 'Diretrizes da comunidade', poweredTitle: 'Desenvolvido por BipolarBear', poweredBody: 'BipolarBear é um diário de humor gratuito para pessoas com transtorno bipolar.', discover: '🐻 Descobrir BipolarBear →', close: 'Fechar' },
      },
      journal: {
        hint: {
          goBack: '🐻 Volte aqui',
          openEntries: '🐻 Clique para abrir suas entradas passadas e estatísticas',
          closeJournal: '🐻 Feche o diário aqui novamente',
          clickHere: '🐻 Clique aqui',
          chooseMood: '🐻 Escolha um humor para começar',
          tapHold: '🐻 👆 Toque e segure um humor para saber mais',
          logMed: '🐻 Registre sua medicação aqui',
          closeToContinue: '🐻 Feche para continuar',
          privateMode: 'Modo privado ativo — esta entrada não aparecerá no seu PDF médico',
          favourite: 'Marcado como favorito — encontre-o nas Estatísticas Totais',
          tutorialDone: 'Tutorial avançado concluído. Tudo pronto!',
        },
        btn: { openJournal: '📔 Abrir Diário', closeJournal: '📕 Fechar Diário' },
        prompt: {
          howFallback: 'Como você se sentiu?',
          howToday: 'Como está sendo o dia?',
          howYesterday: 'Como foi ontem?',
          howDate: 'Como foi {date}?',
          viewTodayEntry: 'Ver entrada de hoje',
          viewYesterdayEntry: 'Ver entrada de ontem',
        },
        nav: { home: '← Início' },
      },
    },

    nl: {
      common: {
        save: 'Opslaan', cancel: 'Annuleren', close: 'Sluiten', edit: 'Bewerken',
        delete: 'Verwijderen', add: 'Toevoegen', back: 'Terug', next: 'Volgende',
        previous: 'Vorige', loading: 'Laden…', gotIt: 'Begrepen',
        signIn: 'Aanmelden', signOut: 'Uitloggen', signUp: 'Registreren',
        skip: 'Nu overslaan', send: 'Versturen', continue: 'Doorgaan',
        remove: 'Verwijderen', keep: 'Bewaren', confirm: 'Bevestigen',
      },
      nav: { journal: 'Stemmingsdagboek', survivalKit: 'Uw Overlevingskit', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: 'Meld u aan om deel te nemen aan de community',
        logoHint: '🐻 psst… klik op mij!',
        journalHint: '🐻 Klik hier om te beginnen!',
        survivalHint: '🐻 Klik hier om meer te leren over uw bipolariteit',
        signinHintLabel: '🐻 Sla uw voortgang hier op',
        signinHintStored: 'Veilig opgeslagen in Firebase',
        madeBy: 'Ontwikkeld door James Markey',
        features: { insightsTitle: 'Visuele Inzichten', insightsDesc: 'Bekijk uw stemmingspatronen met grafieken', privateTitle: 'Privé en Veilig', privateDesc: 'Uw gegevens blijven veilig bij u', trackTitle: 'Blijf op de Goede Weg', trackDesc: 'Bouw gezonde gewoonten op met reeksen' },
        wa: { title: 'Word lid van Bipolar Anonymous', body: 'Wilt u deelnemen aan onze WhatsApp-groep Bipolar Anonymous?', join: '✅ Groep Aansluiten', cancel: 'Annuleren', hide: '🙈 Verberg deze knop' },
        whatsNew: { gotIt: 'Begrepen', changelog: 'Volledig logboek ↗' },
      },
      pd: { title: '👤 Persoonlijke Gegevens', subtitle: 'Alle velden zijn optioneel. Verschijnt op geëxporteerde PDF-rapporten voor uw zorgverlener.', name: 'Naam', dob: 'Geboortedatum (bijv. 15 Jan 1990)', medNum: 'Medisch Nummer', diagnosis: 'Gediagnosticeerd als (bijv. Bipolair I, Bipolair II)', diagDate: 'Diagnose Datum (bijv. Maart 2020)', address: 'Adres', mobile: 'Mobiel Nummer', email: 'E-mail', emergency: 'Noodcontact (naam en nummer)', notes: 'Notities (optioneel)' },
      pin: { title: 'Voer uw PIN in om door te gaan', moreInfo: '🔐 Meer info', whyTitle: '🔐 Waarom is er een PIN?', forgot: 'PIN vergeten?', tapToWake: 'Tik om te wekken', incorrect: 'Onjuiste PIN. Probeer opnieuw.', gotIt: 'Begrepen' },
      auth: { welcome: 'Welkom bij Bipolar Bear 🐻', noAccount: 'Geen account?', hasAccount: 'Heeft u al een account?', signUpLink: 'Registreer', continueGuest: 'Doorgaan als gast' },
      account: { signOut: 'Uitloggen', changePassword: 'Wachtwoord wijzigen', changeEmail: 'E-mail wijzigen', currentPassword: 'Huidig wachtwoord', newPassword: 'Nieuw wachtwoord', newEmail: 'Nieuw e-mailadres', cancel: 'Annuleren', language: 'Taal' },
      i18n: { chooseLang: 'Kies uw taal', continue: 'Doorgaan' },
      mood: { manic: 'Manisch', elevated: 'Verhoogd', good: 'Goed', low: 'Laag', depressed: 'Depressief' },
      anon: {
        verify: { back: '← Startpagina', welcome: 'Welkom 👋', sub: 'Verifieer uw e-mail om deel te nemen. Uw identiteit blijft privé.', sendCode: 'Verificatiecode versturen', verify: 'Verifiëren →', changeEmail: '← E-mail wijzigen', resend: 'Code opnieuw verzenden' },
        monika: { verified: 'E-mail Geverifieerd!', chooseSub: 'Kies nu uw <strong>Monika</strong> — uw anonieme naam. Max. 10 tekens.', postPreview: 'Uw berichten zullen er zo uitzien', btn: 'Dat ben ik →', placeholder: 'bijv. SunnyDaze' },
        meds: { title: 'Zichtbaarheid Medicatie', sub: 'Wilt u uw huidige medicatie tonen bij uw berichten?', yesLabel: 'Ja, mijn medicatie tonen', yesSub: 'Anderen kunnen uw medicatie zien — helpt minder alleen te voelen', noLabel: 'Nee, privé houden', noSub: 'Alleen uw Monika en reeks worden getoond' },
        medDefine: { title: 'Uw Medicatie', sub: 'Voeg uw huidige medicijnen toe. Alleen de naam zal zichtbaar zijn.', namePlaceholder: 'Medicijnnaam', dosePlaceholder: 'Dosering (optioneel)', addBtn: '+ Toevoegen', continueBtn: 'Doorgaan →', skipBtn: 'Nu overslaan' },
        board: { announcements: '📢 Aankondigingen', general: '💬 Algemeen', loading: 'Berichten laden…', empty: 'Nog geen berichten — wees de eerste!' },
        compose: { placeholder: 'Deel met de gemeenschap…', cancel: 'Annuleren', post: 'Plaatsen 🐻' },
        firstPost: { title: 'Bedankt voor uw bericht!', sub: 'Uw bericht is nu live. Blijf jezelf 💛', awesome: 'Super! 🐻', close: 'Sluiten' },
        sos: { title: 'SOS-signaal versturen', body: 'Maakt u zich zorgen over deze gebruiker? Een moderator wordt gewaarschuwd. Gebruik dit alleen als u echt bezorgd bent.', cancel: 'Annuleren', confirm: 'SOS versturen 🆘' },
        report: { title: 'Dit bericht rapporteren?', why: 'Waarom rapporteert u dit?', unkind: 'Onvriendelijk of grof', misinfo: 'Desinformatie', spam: 'Spam', other: 'Andere zorg', note: 'Bans zijn tijdelijk — iedereen verdient een tweede kans 💛' },
        e2ee: { title: 'End-to-End Versleuteld', sub: 'BipolarBear Anonymous is gebouwd met uw privacy als kern:', messagesTitle: 'Berichten zijn versleuteld', messagesSub: 'Alleen communityleden kunnen berichten lezen — nooit derden.', identityTitle: 'Geen identiteit opgeslagen', identitySub: 'Uw e-mail wordt geverifieerd en vervolgens verwijderd. Uw Monika is alles wat we bewaren.', noSellTitle: 'Geen dataverkoop', noSellSub: 'We zullen uw gegevens nooit verkopen, delen of monetariseren.', secureTitle: 'Veilig door ontwerp', secureSub: 'Van de grond af opgebouwd met industriestandaard versleutelingsprotocollen.', gotIt: 'Begrepen 👍' },
        monikaSettings: { title: 'Uw Monika', monikaName: 'Monika Naam', initials: 'Initialen (2 letters, leeg voor auto)', initialsPlaceholder: 'Auto', color: 'Avatar Kleur', preview: 'Voorbeeld', medication: 'Medicatie', stability: 'Stabiliteitsteller', loading: 'Laden…', cancel: 'Annuleren', save: 'Wijzigingen opslaan ✓', back: '← Terug naar Bipolar Bear', signOut: 'Uitloggen' },
        medOv: { title: 'Uw Medicatie', visibility: 'Zichtbaarheid in berichten', showOnPosts: '✅ Tonen in berichten', private: '🔒 Privé', yourMeds: 'Uw Medicijnen', namePlaceholder: 'Medicijnnaam', dosePlaceholder: 'Dosering (optioneel)', add: '+ Toevoegen', bbNote: '💡 U bent aangemeld bij BipolarBear — opslaan werkt ook uw medicatie bij.', cancel: 'Annuleren', save: 'Opslaan ✓' },
        stableOv: { title: 'Stabiliteitsteller', visibility: 'Zichtbaarheid in berichten', showOnPosts: '✅ Tonen in berichten', private: '🔒 Privé', stableDays: '{n} opeenvolgende stabiele dagen', bbAuto: 'Automatisch berekend uit uw BipolarBear-dagboek.', stableSince: 'Stabiel sinds', stableSinceDesc: 'Voer de startdatum van uw huidige stabiele periode in.', cancel: 'Annuleren', save: 'Opslaan ✓' },
        selfDelete: { title: 'Uw bericht verwijderen?', sub: 'Dit verwijdert uw bericht permanent. Dit kan niet ongedaan worden gemaakt.', keep: 'Bewaren', remove: 'Bericht verwijderen' },
        adminDelete: { title: 'Bericht verwijderen?', sub: 'Dit bericht wordt vervangen door "verwijderd door admin".', cancel: 'Annuleren', delete: 'Verwijderen 🗑️' },
        about: { subtitle: 'Een veilige plek voor mensen met bipolariteit', body: 'Een anonieme community voor mensen met een bipolaire stoornis.', guidelinesTitle: 'Community richtlijnen', poweredTitle: 'Powered by BipolarBear', poweredBody: 'BipolarBear is een gratis stemmingsdagboek voor mensen met een bipolaire stoornis.', discover: '🐻 Ontdek BipolarBear →', close: 'Sluiten' },
      },
      journal: {
        hint: {
          goBack: '🐻 Ga hier terug',
          openEntries: '🐻 Klik om uw vorige items en statistieken te openen',
          closeJournal: '🐻 Sluit het dagboek hier weer',
          clickHere: '🐻 Klik hier',
          chooseMood: '🐻 Kies een stemming om te beginnen',
          tapHold: '🐻 👆 Tik en houd een stemming ingedrukt voor meer info',
          logMed: '🐻 Registreer uw medicatie hier',
          closeToContinue: '🐻 Sluit om door te gaan',
          privateMode: 'Privémodus aan — dit item verschijnt niet in uw medisch PDF',
          favourite: 'Gemarkeerd als favoriet — vind het in Alle-tijden Statistieken',
          tutorialDone: 'Geavanceerde tutorial voltooid. U bent helemaal klaar!',
        },
        btn: { openJournal: '📔 Dagboek openen', closeJournal: '📕 Dagboek sluiten' },
        prompt: {
          howFallback: 'Hoe voelde u zich?',
          howToday: 'Hoe gaat het vandaag?',
          howYesterday: 'Hoe was gisteren?',
          howDate: 'Hoe was {date}?',
          viewTodayEntry: 'Bekijk de invoer van vandaag',
          viewYesterdayEntry: 'Bekijk de invoer van gisteren',
        },
        nav: { home: '← Startpagina' },
      },
    },

    pl: {
      common: {
        save: 'Zapisz', cancel: 'Anuluj', close: 'Zamknij', edit: 'Edytuj',
        delete: 'Usuń', add: 'Dodaj', back: 'Wróć', next: 'Dalej',
        previous: 'Poprzedni', loading: 'Ładowanie…', gotIt: 'Rozumiem',
        signIn: 'Zaloguj się', signOut: 'Wyloguj się', signUp: 'Zarejestruj się',
        skip: 'Pomiń na razie', send: 'Wyślij', continue: 'Kontynuuj',
        remove: 'Usuń', keep: 'Zachowaj', confirm: 'Potwierdź',
      },
      nav: { journal: 'Dziennik Nastroju', survivalKit: 'Twój Zestaw Przetrwania', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: 'Zaloguj się, aby dołączyć do społeczności',
        logoHint: '🐻 psst… kliknij mnie!',
        journalHint: '🐻 Kliknij tutaj, aby rozpocząć!',
        survivalHint: '🐻 Kliknij tutaj, aby dowiedzieć się więcej o swoim bipolarze',
        signinHintLabel: '🐻 Zapisz swój postęp tutaj',
        signinHintStored: 'Bezpiecznie przechowywane w Firebase',
        madeBy: 'Tworzone przez James Markey',
        features: { insightsTitle: 'Wizualne Spostrzeżenia', insightsDesc: 'Zobacz swoje wzorce nastroju na wykresach', privateTitle: 'Prywatny i Bezpieczny', privateDesc: 'Twoje dane są bezpieczne', trackTitle: 'Utrzymaj Kurs', trackDesc: 'Buduj zdrowe nawyki z seriami' },
        wa: { title: 'Dołącz do Bipolar Anonymous', body: 'Chcesz dołączyć do naszej grupy WhatsApp Bipolar Anonymous?', join: '✅ Dołącz do Grupy', cancel: 'Anuluj', hide: '🙈 Ukryj ten przycisk' },
        whatsNew: { gotIt: 'Rozumiem', changelog: 'Pełny rejestr ↗' },
      },
      pd: { title: '👤 Dane Osobowe', subtitle: 'Wszystkie pola są opcjonalne. Pojawia się na eksportowanych raportach PDF dla Twojego lekarza.', name: 'Imię i nazwisko', dob: 'Data urodzenia (np. 15 Sty 1990)', medNum: 'Numer ubezpieczenia zdrowotnego', diagnosis: 'Zdiagnozowany jako (np. Bipolar I, Bipolar II)', diagDate: 'Data diagnozy (np. Marzec 2020)', address: 'Adres', mobile: 'Numer telefonu', email: 'E-mail', emergency: 'Kontakt awaryjny (imię i numer)', notes: 'Notatki (opcjonalne)' },
      pin: { title: 'Wprowadź PIN, aby kontynuować', moreInfo: '🔐 Więcej info', whyTitle: '🔐 Dlaczego jest PIN?', forgot: 'Zapomniałeś PIN?', tapToWake: 'Dotknij, aby obudzić', incorrect: 'Nieprawidłowy PIN. Spróbuj ponownie.', gotIt: 'Rozumiem' },
      auth: { welcome: 'Witaj w Bipolar Bear 🐻', noAccount: 'Nie masz konta?', hasAccount: 'Masz już konto?', signUpLink: 'Zarejestruj się', continueGuest: 'Kontynuuj jako gość' },
      account: { signOut: 'Wyloguj się', changePassword: 'Zmień hasło', changeEmail: 'Zmień e-mail', currentPassword: 'Aktualne hasło', newPassword: 'Nowe hasło', newEmail: 'Nowy adres e-mail', cancel: 'Anuluj', language: 'Język' },
      i18n: { chooseLang: 'Wybierz język', continue: 'Kontynuuj' },
      mood: { manic: 'Maniakalny', elevated: 'Podwyższony', good: 'Dobrze', low: 'Niski', depressed: 'Przygnębiony' },
      anon: {
        verify: { back: '← Strona główna', welcome: 'Witaj 👋', sub: 'Zweryfikuj e-mail, aby dołączyć do społeczności. Twoja tożsamość pozostaje prywatna.', sendCode: 'Wyślij kod weryfikacyjny', verify: 'Weryfikuj →', changeEmail: '← Zmień e-mail', resend: 'Wyślij ponownie' },
        monika: { verified: 'E-mail Zweryfikowany!', chooseSub: 'Teraz wybierz swój <strong>Monika</strong> — anonimową nazwę. Maks. 10 znaków.', postPreview: 'Twoje wpisy będą wyglądać tak', btn: 'To ja →', placeholder: 'np. SunnyDaze' },
        meds: { title: 'Widoczność Leków', sub: 'Czy chcesz pokazywać swoje leki przy wpisach?', yesLabel: 'Tak, pokaż moje leki', yesSub: 'Inni widzą Twoje leki — pomaga czuć się mniej samotnie', noLabel: 'Nie, zachowaj prywatność', noSub: 'Tylko Twoja Monika i seria będą widoczne' },
        medDefine: { title: 'Twoje Leki', sub: 'Dodaj swoje aktualne leki. Tylko nazwa będzie widoczna.', namePlaceholder: 'Nazwa leku', dosePlaceholder: 'Dawka (opcjonalnie)', addBtn: '+ Dodaj', continueBtn: 'Kontynuuj →', skipBtn: 'Pomiń na razie' },
        board: { announcements: '📢 Ogłoszenia', general: '💬 Ogólne', loading: 'Ładowanie wpisów…', empty: 'Brak wpisów — bądź pierwszy!' },
        compose: { placeholder: 'Podziel się ze społecznością…', cancel: 'Anuluj', post: 'Opublikuj 🐻' },
        firstPost: { title: 'Dziękujemy za wpis!', sub: 'Twój wpis jest teraz widoczny. Bądź sobą 💛', awesome: 'Super! 🐻', close: 'Zamknij' },
        sos: { title: 'Wyślij sygnał SOS', body: 'Martwisz się o tego użytkownika? Moderator zostanie powiadomiony. Używaj tylko jeśli naprawdę zaniepokojony.', cancel: 'Anuluj', confirm: 'Wyślij SOS 🆘' },
        report: { title: 'Zgłosić ten wpis?', why: 'Dlaczego zgłaszasz?', unkind: 'Nieuprzejmy lub niegrzeczny', misinfo: 'Dezinformacja', spam: 'Spam', other: 'Inna sprawa', note: 'Bany są tymczasowe — każdy zasługuje na drugą szansę 💛' },
        e2ee: { title: 'Szyfrowanie End-to-End', sub: 'BipolarBear Anonymous jest zbudowane z Twoją prywatnością w centrum:', messagesTitle: 'Wiadomości są zaszyfrowane', messagesSub: 'Tylko członkowie społeczności mogą czytać wpisy — nigdy strony trzecie.', identityTitle: 'Brak przechowywanej tożsamości', identitySub: 'Twój e-mail jest weryfikowany, a następnie usuwany. Twoja Monika to wszystko, co przechowujemy.', noSellTitle: 'Zero sprzedaży danych', noSellSub: 'Nigdy nie sprzedamy, nie udostępnimy ani nie spieniężymy Twoich danych.', secureTitle: 'Bezpieczny z założenia', secureSub: 'Zbudowany na standardowych protokołach szyfrowania od podstaw.', gotIt: 'Rozumiem 👍' },
        monikaSettings: { title: 'Twoja Monika', monikaName: 'Nazwa Monika', initials: 'Inicjały (2 litery, puste dla auto)', initialsPlaceholder: 'Auto', color: 'Kolor Avatara', preview: 'Podgląd', medication: 'Leki', stability: 'Licznik Stabilności', loading: 'Ładowanie…', cancel: 'Anuluj', save: 'Zapisz zmiany ✓', back: '← Wróć do Bipolar Bear', signOut: 'Wyloguj się' },
        medOv: { title: 'Twoje Leki', visibility: 'Widoczność we wpisach', showOnPosts: '✅ Pokaż we wpisach', private: '🔒 Prywatne', yourMeds: 'Twoje Leki', namePlaceholder: 'Nazwa leku', dosePlaceholder: 'Dawka (opcjonalnie)', add: '+ Dodaj', bbNote: '💡 Jesteś zalogowany w BipolarBear — zapis zaktualizuje też Twoje leki.', cancel: 'Anuluj', save: 'Zapisz ✓' },
        stableOv: { title: 'Licznik Stabilności', visibility: 'Widoczność we wpisach', showOnPosts: '✅ Pokaż we wpisach', private: '🔒 Prywatne', stableDays: '{n} kolejnych stabilnych dni', bbAuto: 'Automatycznie obliczane z Twojego dziennika BipolarBear.', stableSince: 'Stabilny od', stableSinceDesc: 'Wprowadź datę rozpoczęcia aktualnego okresu stabilności.', cancel: 'Anuluj', save: 'Zapisz ✓' },
        selfDelete: { title: 'Usunąć Twój wpis?', sub: 'To trwale usunie Twój wpis. Nie można tego cofnąć.', keep: 'Zachowaj', remove: 'Usuń wpis' },
        adminDelete: { title: 'Usunąć Wpis?', sub: 'Ten wpis zostanie zastąpiony przez "usunięty przez admina".', cancel: 'Anuluj', delete: 'Usuń 🗑️' },
        about: { subtitle: 'Bezpieczne miejsce dla osób z chorobą dwubiegunową', body: 'Anonimowa społeczność dla osób z chorobą dwubiegunową.', guidelinesTitle: 'Zasady społeczności', poweredTitle: 'Powered by BipolarBear', poweredBody: 'BipolarBear to bezpłatny dziennik nastroju dla osób z chorobą dwubiegunową.', discover: '🐻 Odkryj BipolarBear →', close: 'Zamknij' },
      },
      journal: {
        hint: {
          goBack: '🐻 Wróć tutaj',
          openEntries: '🐻 Kliknij, aby otworzyć poprzednie wpisy i statystyki',
          closeJournal: '🐻 Zamknij dziennik tutaj',
          clickHere: '🐻 Kliknij tutaj',
          chooseMood: '🐻 Wybierz nastrój, aby zacząć',
          tapHold: '🐻 👆 Przytrzymaj nastrój, aby dowiedzieć się więcej',
          logMed: '🐻 Zapisz leki tutaj',
          closeToContinue: '🐻 Zamknij, aby kontynuować',
          privateMode: 'Tryb prywatny włączony — ten wpis nie pojawi się w Twoim PDF medycznym',
          favourite: 'Oznaczono jako ulubione — znajdź je w Statystykach Wszechczasowych',
          tutorialDone: 'Zaawansowany samouczek ukończony. Wszystko gotowe!',
        },
        btn: { openJournal: '📔 Otwórz Dziennik', closeJournal: '📕 Zamknij Dziennik' },
        prompt: {
          howFallback: 'Jak się czułeś?',
          howToday: 'Jak mija dzień?',
          howYesterday: 'Jak było wczoraj?',
          howDate: 'Jak było {date}?',
          viewTodayEntry: 'Zobacz dzisiejszy wpis',
          viewYesterdayEntry: 'Zobacz wczorajszy wpis',
        },
        nav: { home: '← Strona główna' },
      },
    },

    sv: {
      common: {
        save: 'Spara', cancel: 'Avbryt', close: 'Stäng', edit: 'Redigera',
        delete: 'Ta bort', add: 'Lägg till', back: 'Tillbaka', next: 'Nästa',
        previous: 'Föregående', loading: 'Laddar…', gotIt: 'Förstått',
        signIn: 'Logga in', signOut: 'Logga ut', signUp: 'Registrera',
        skip: 'Hoppa över', send: 'Skicka', continue: 'Fortsätt',
        remove: 'Ta bort', keep: 'Behåll', confirm: 'Bekräfta',
      },
      nav: { journal: 'Stämningsdagbok', survivalKit: 'Ditt Överlevnadskit', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: 'Logga in för att gå med i gemenskapen',
        logoHint: '🐻 psst… klicka på mig!',
        journalHint: '🐻 Klicka här för att komma igång!',
        survivalHint: '🐻 Klicka här för att lära dig mer om din bipolaritet',
        signinHintLabel: '🐻 Spara dina framsteg här',
        signinHintStored: 'Lagrat säkert i Firebase',
        madeBy: 'Skapas av James Markey',
        features: { insightsTitle: 'Visuella Insikter', insightsDesc: 'Se dina stämningsmönster med diagram', privateTitle: 'Privat & Säkert', privateDesc: 'Dina data förblir säkra hos dig', trackTitle: 'Håll Dig på Rätt Spår', trackDesc: 'Bygg hälsosamma vanor med serier' },
        wa: { title: 'Gå med i Bipolar Anonymous', body: 'Vill du gå med i vår WhatsApp-grupp Bipolar Anonymous?', join: '✅ Gå med i Gruppen', cancel: 'Avbryt', hide: '🙈 Dölj den här knappen' },
        whatsNew: { gotIt: 'Förstått', changelog: 'Fullständig logg ↗' },
      },
      pd: { title: '👤 Personliga Uppgifter', subtitle: 'Alla fält är valfria. Visas på exporterade PDF-rapporter för din vårdgivare.', name: 'Namn', dob: 'Födelsedatum (t.ex. 15 Jan 1990)', medNum: 'Sjukförsäkringsnummer', diagnosis: 'Diagnostiserad som (t.ex. Bipolär I, Bipolär II)', diagDate: 'Diagnos Datum (t.ex. Mars 2020)', address: 'Adress', mobile: 'Mobilnummer', email: 'E-post', emergency: 'Nödkontakt (namn och nummer)', notes: 'Anteckningar (valfritt)' },
      pin: { title: 'Ange din PIN-kod för att fortsätta', moreInfo: '🔐 Mer info', whyTitle: '🔐 Varför finns det en PIN-kod?', forgot: 'Glömt PIN?', tapToWake: 'Tryck för att väcka', incorrect: 'Fel PIN-kod. Försök igen.', gotIt: 'Förstått' },
      auth: { welcome: 'Välkommen till Bipolar Bear 🐻', noAccount: 'Inget konto?', hasAccount: 'Har du redan ett konto?', signUpLink: 'Registrera', continueGuest: 'Fortsätt som gäst' },
      account: { signOut: 'Logga ut', changePassword: 'Byt lösenord', changeEmail: 'Byt e-post', currentPassword: 'Nuvarande lösenord', newPassword: 'Nytt lösenord', newEmail: 'Ny e-postadress', cancel: 'Avbryt', language: 'Språk' },
      i18n: { chooseLang: 'Välj ditt språk', continue: 'Fortsätt' },
      mood: { manic: 'Manisk', elevated: 'Förhöjd', good: 'Bra', low: 'Låg', depressed: 'Deprimerad' },
      anon: {
        verify: { back: '← Hem', welcome: 'Välkommen 👋', sub: 'Verifiera din e-post för att gå med i gemenskapen. Din identitet förblir privat.', sendCode: 'Skicka verifieringskod', verify: 'Verifiera →', changeEmail: '← Byt e-post', resend: 'Skicka om koden' },
        monika: { verified: 'E-post Verifierad!', chooseSub: 'Välj nu din <strong>Monika</strong> — ditt anonyma namn. Max 10 tecken.', postPreview: 'Dina inlägg kommer se ut så här', btn: 'Det är jag →', placeholder: 't.ex. SunnyDaze' },
        meds: { title: 'Synlighet för Mediciner', sub: 'Vill du visa din nuvarande medicin med dina inlägg?', yesLabel: 'Ja, visa min medicinering', yesSub: 'Andra kan se din medicin — hjälper folk att känna sig mindre ensamma', noLabel: 'Nej, håll det privat', noSub: 'Bara din Monika och serie visas' },
        medDefine: { title: 'Din Medicinering', sub: 'Lägg till dina nuvarande mediciner. Bara namnet kommer vara synligt.', namePlaceholder: 'Medicinnamn', dosePlaceholder: 'Dosering (valfritt)', addBtn: '+ Lägg till', continueBtn: 'Fortsätt →', skipBtn: 'Hoppa över' },
        board: { announcements: '📢 Meddelanden', general: '💬 Allmänt', loading: 'Laddar inlägg…', empty: 'Inga inlägg ännu — var den första!' },
        compose: { placeholder: 'Dela med gemenskapen…', cancel: 'Avbryt', post: 'Posta 🐻' },
        firstPost: { title: 'Tack för ditt inlägg!', sub: 'Ditt inlägg är nu live. Fortsätt vara du 💛', awesome: 'Super! 🐻', close: 'Stäng' },
        sos: { title: 'Skicka SOS-signal', body: 'Är du orolig för den här användaren? En moderator meddelas. Använd bara om du är genuint orolig.', cancel: 'Avbryt', confirm: 'Skicka SOS 🆘' },
        report: { title: 'Rapportera det här inlägget?', why: 'Varför rapporterar du detta?', unkind: 'Ovänlig eller oförskämd', misinfo: 'Desinformation', spam: 'Spam', other: 'Annan anledning', note: 'Blockeringar är tillfälliga — alla förtjänar en andra chans 💛' },
        e2ee: { title: 'End-to-End Krypterat', sub: 'BipolarBear Anonymous är byggt med din integritet i centrum:', messagesTitle: 'Meddelanden är krypterade', messagesSub: 'Bara communitymedlemmar kan läsa inlägg — aldrig tredje parter.', identityTitle: 'Ingen identitet sparad', identitySub: 'Din e-post verifieras och kasseras sedan. Din Monika är allt vi sparar.', noSellTitle: 'Ingen dataförsäljning', noSellSub: 'Vi kommer aldrig sälja, dela eller tjäna pengar på din data.', secureTitle: 'Säker genom design', secureSub: 'Byggt på branschstandardkrypteringsprotokoll från grunden.', gotIt: 'Förstått 👍' },
        monikaSettings: { title: 'Din Monika', monikaName: 'Monika Namn', initials: 'Initialer (2 bokstäver, tomt för auto)', initialsPlaceholder: 'Auto', color: 'Avatar Färg', preview: 'Förhandsgranskning', medication: 'Medicinering', stability: 'Stabilitetsräknare', loading: 'Laddar…', cancel: 'Avbryt', save: 'Spara ändringar ✓', back: '← Tillbaka till Bipolar Bear', signOut: 'Logga Ut' },
        medOv: { title: 'Din Medicinering', visibility: 'Synlighet i inlägg', showOnPosts: '✅ Visa i inlägg', private: '🔒 Privat', yourMeds: 'Dina Mediciner', namePlaceholder: 'Medicinnamn', dosePlaceholder: 'Dosering (valfritt)', add: '+ Lägg till', bbNote: '💡 Du är inloggad på BipolarBear — att spara uppdaterar också din medicin.', cancel: 'Avbryt', save: 'Spara ✓' },
        stableOv: { title: 'Stabilitetsräknare', visibility: 'Synlighet i inlägg', showOnPosts: '✅ Visa i inlägg', private: '🔒 Privat', stableDays: '{n} på varandra följande stabila dagar', bbAuto: 'Automatiskt beräknat från din BipolarBear-dagbok.', stableSince: 'Stabil sedan', stableSinceDesc: 'Ange startdatumet för din nuvarande stabila period.', cancel: 'Avbryt', save: 'Spara ✓' },
        selfDelete: { title: 'Ta bort ditt inlägg?', sub: 'Detta tar bort ditt inlägg permanent. Kan inte ångras.', keep: 'Behåll det', remove: 'Ta bort inlägg' },
        adminDelete: { title: 'Ta bort Inlägg?', sub: 'Det här inlägget ersätts med "raderat av admin".', cancel: 'Avbryt', delete: 'Ta bort 🗑️' },
        about: { subtitle: 'Ett tryggt utrymme för människor med bipolaritet', body: 'En anonym gemenskap för människor med bipolärt syndrom.', guidelinesTitle: 'Gemenskapens riktlinjer', poweredTitle: 'Powered by BipolarBear', poweredBody: 'BipolarBear är en gratis stämningsdagbok för människor med bipolärt syndrom.', discover: '🐻 Upptäck BipolarBear →', close: 'Stäng' },
      },
      journal: {
        hint: {
          goBack: '🐻 Gå tillbaka här',
          openEntries: '🐻 Klicka för att öppna dina tidigare inlägg och statistik',
          closeJournal: '🐻 Stäng dagboken här igen',
          clickHere: '🐻 Klicka här',
          chooseMood: '🐻 Välj en stämning för att komma igång',
          tapHold: '🐻 👆 Tryck och håll en stämning för mer info',
          logMed: '🐻 Logga din medicinering här',
          closeToContinue: '🐻 Stäng för att fortsätta',
          privateMode: 'Privatläge på — det här inlägget visas inte i din medicinska PDF',
          favourite: 'Markerad som favorit — hitta den i Statistik för alltid',
          tutorialDone: 'Avancerad handledning klar. Du är redo!',
        },
        btn: { openJournal: '📔 Öppna Dagbok', closeJournal: '📕 Stäng Dagbok' },
        prompt: {
          howFallback: 'Hur kände du dig?',
          howToday: 'Hur går dagen?',
          howYesterday: 'Hur var igår?',
          howDate: 'Hur var {date}?',
          viewTodayEntry: 'Visa dagens anteckning',
          viewYesterdayEntry: 'Visa gårdagens anteckning',
        },
        nav: { home: '← Hem' },
      },
    },

    zh: {
      common: {
        save: '保存', cancel: '取消', close: '关闭', edit: '编辑',
        delete: '删除', add: '添加', back: '返回', next: '下一步',
        previous: '上一步', loading: '加载中…', gotIt: '明白了',
        signIn: '登录', signOut: '退出登录', signUp: '注册',
        skip: '稍后再说', send: '发送', continue: '继续',
        remove: '删除', keep: '保留', confirm: '确认',
      },
      nav: { journal: '情绪日记', survivalKit: '你的生存工具包', anonymous: 'Bipolar Anonymous' },
      home: {
        signInNote: '登录以加入社区',
        logoHint: '🐻 嘿……点击我！',
        journalHint: '🐻 点击这里开始！',
        survivalHint: '🐻 点击这里了解更多关于你的双相情感障碍',
        signinHintLabel: '🐻 在这里保存你的进度',
        signinHintStored: '安全存储在Firebase中',
        madeBy: '由James Markey开发',
        features: { insightsTitle: '可视化洞察', insightsDesc: '通过图表查看情绪变化规律', privateTitle: '私密且安全', privateDesc: '您的数据安全保存', trackTitle: '保持进度', trackDesc: '通过连续记录养成健康习惯' },
        wa: { title: '加入Bipolar Anonymous', body: '您想加入我们的WhatsApp群组Bipolar Anonymous吗？', join: '✅ 加入群组', cancel: '取消', hide: '🙈 隐藏此按钮' },
        whatsNew: { gotIt: '明白了', changelog: '完整更新日志 ↗' },
      },
      pd: { title: '👤 个人信息', subtitle: '所有字段为可选项。出现在为您的医疗提供者导出的PDF报告中。', name: '姓名', dob: '出生日期（如 1990年1月15日）', medNum: '医疗证号', diagnosis: '诊断为（如双相障碍I型，双相障碍II型）', diagDate: '诊断日期（如 2020年3月）', address: '地址', mobile: '手机号码', email: '电子邮件', emergency: '紧急联系人（姓名和电话）', notes: '备注（可选）' },
      pin: { title: '请输入PIN码继续', moreInfo: '🔐 更多信息', whyTitle: '🔐 为什么有PIN码？', forgot: '忘记PIN码？', tapToWake: '点击唤醒', incorrect: 'PIN码错误，请重试。', gotIt: '明白了' },
      auth: { welcome: '欢迎使用Bipolar Bear 🐻', noAccount: '没有账号？', hasAccount: '已有账号？', signUpLink: '注册', continueGuest: '以访客身份继续' },
      account: { signOut: '退出登录', changePassword: '修改密码', changeEmail: '修改邮箱', currentPassword: '当前密码', newPassword: '新密码', newEmail: '新邮箱地址', cancel: '取消', language: '语言' },
      i18n: { chooseLang: '选择您的语言', continue: '继续' },
      mood: { manic: '躁狂', elevated: '高涨', good: '良好', low: '低落', depressed: '抑郁' },
      anon: {
        verify: { back: '← 首页', welcome: '欢迎 👋', sub: '验证您的邮箱以加入社区。您的身份将保持私密。', sendCode: '发送验证码', verify: '验证 →', changeEmail: '← 更换邮箱', resend: '重新发送验证码' },
        monika: { verified: '邮箱已验证！', chooseSub: '现在选择您的<strong>Monika</strong> — 您的匿名社区名称。最多10个字符。', postPreview: '您的帖子将如此显示', btn: '就是我 →', placeholder: '如 SunnyDaze' },
        meds: { title: '药物可见性', sub: '您是否希望在帖子旁边显示您当前的药物？', yesLabel: '是，显示我的药物', yesSub: '其他人可以看到您的药物——帮助人们感觉不那么孤单', noLabel: '不，保持私密', noSub: '只显示您的Monika和连续天数' },
        medDefine: { title: '您的药物', sub: '添加您当前的药物。只有名称会在帖子中可见。', namePlaceholder: '药物名称', dosePlaceholder: '剂量（可选）', addBtn: '+ 添加', continueBtn: '继续 →', skipBtn: '稍后再说' },
        board: { announcements: '📢 公告', general: '💬 综合', loading: '加载帖子中…', empty: '还没有帖子——成为第一个！' },
        compose: { placeholder: '与社区分享…', cancel: '取消', post: '发布 🐻' },
        firstPost: { title: '感谢您的发帖！', sub: '您的帖子已发布。继续做自己 💛', awesome: '太棒了 🐻', close: '关闭' },
        sos: { title: '发送SOS标志', body: '您是否担心此用户？版主将收到通知。仅在真正担忧时使用。', cancel: '取消', confirm: '发送SOS 🆘' },
        report: { title: '举报此帖子？', why: '您为什么要举报？', unkind: '不友善或粗鲁', misinfo: '虚假信息', spam: '垃圾信息', other: '其他问题', note: '封禁是临时的——每个人都值得第二次机会 💛' },
        e2ee: { title: '端到端加密', sub: 'BipolarBear Anonymous以您的隐私为核心：', messagesTitle: '消息已加密', messagesSub: '只有社区成员可以阅读帖子——永远不会有第三方。', identityTitle: '不存储任何身份信息', identitySub: '您的邮箱经过验证后即被丢弃。您的Monika是我们保存的全部信息。', noSellTitle: '绝不出售数据', noSellSub: '我们永远不会出售、分享或将您的数据商业化。', secureTitle: '安全设计', secureSub: '从零开始基于行业标准加密协议构建。', gotIt: '明白了 👍' },
        monikaSettings: { title: '您的Monika', monikaName: 'Monika名称', initials: '首字母（2个字母，留空自动）', initialsPlaceholder: '自动', color: '头像颜色', preview: '预览', medication: '药物', stability: '稳定计数器', loading: '加载中…', cancel: '取消', save: '保存更改 ✓', back: '← 返回Bipolar Bear', signOut: '退出登录' },
        medOv: { title: '您的药物', visibility: '帖子中的可见性', showOnPosts: '✅ 在帖子中显示', private: '🔒 私密', yourMeds: '您的药物', namePlaceholder: '药物名称', dosePlaceholder: '剂量（可选）', add: '+ 添加', bbNote: '💡 您已登录BipolarBear——保存也将更新主应用中的药物信息。', cancel: '取消', save: '保存 ✓' },
        stableOv: { title: '稳定计数器', visibility: '帖子中的可见性', showOnPosts: '✅ 在帖子中显示', private: '🔒 私密', stableDays: '{n}天连续稳定', bbAuto: '根据您的BipolarBear日记自动计算。', stableSince: '稳定自', stableSinceDesc: '输入您当前稳定期的开始日期。', cancel: '取消', save: '保存 ✓' },
        selfDelete: { title: '删除您的帖子？', sub: '这将永久删除您的帖子，无法撤销。', keep: '保留', remove: '删除帖子' },
        adminDelete: { title: '删除帖子？', sub: '此帖子将被替换为"已由管理员删除"，无法撤销。', cancel: '取消', delete: '删除 🗑️' },
        about: { subtitle: '为双相情感障碍患者提供的安全空间', body: '这是一个为双相情感障碍患者提供的匿名同伴社区。', guidelinesTitle: '社区指南', poweredTitle: '由BipolarBear提供支持', poweredBody: 'BipolarBear是一款为双相情感障碍患者提供的免费情绪日记应用。', discover: '🐻 发现BipolarBear →', close: '关闭' },
      },
      journal: {
        hint: {
          goBack: '🐻 在这里返回',
          openEntries: '🐻 点击查看过去的记录和统计',
          closeJournal: '🐻 在这里关闭日记',
          clickHere: '🐻 点击这里',
          chooseMood: '🐻 选择一种心情开始',
          tapHold: '🐻 👆 长按心情以了解更多',
          logMed: '🐻 在这里记录用药',
          closeToContinue: '🐻 关闭以继续',
          privateMode: '私密模式已开启 — 此条目不会出现在您的医疗记录PDF中',
          favourite: '已标记为收藏 — 随时在历史统计中找到它',
          tutorialDone: '高级教程已完成。一切就绪！',
        },
        btn: { openJournal: '📔 打开日记', closeJournal: '📕 关闭日记' },
        prompt: {
          howFallback: '你感觉怎么样？',
          howToday: '今天过得怎么样？',
          howYesterday: '昨天过得怎么样？',
          howDate: '{date}过得怎么样？',
          viewTodayEntry: '查看今天的记录',
          viewYesterdayEntry: '查看昨天的记录',
        },
        nav: { home: '← 首页' },
      },
    },

  }; // end _locales

  // ── Language list ─────────────────────────────────────────────────────────

  var _languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pl', name: 'Polski' },
    { code: 'sv', name: 'Svenska' },
    { code: 'zh', name: '中文' },
  ];

  // ── Engine ────────────────────────────────────────────────────────────────

  var _lang = 'en';

  function _resolve(obj, key) {
    var parts = key.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return null;
      cur = cur[parts[i]];
    }
    return typeof cur === 'string' ? cur : null;
  }

  function t(key, vars) {
    var locale = _locales[_lang] || _locales['en'];
    var val = _resolve(locale, key) || _resolve(_locales['en'], key) || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      });
    }
    return val;
  }

  function applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    document.documentElement.lang = _lang === 'zh' ? 'zh-Hans' : _lang;
  }

  function setLanguage(code) {
    if (!_locales[code]) return;
    _lang = code;
    try { localStorage.setItem('bbLanguage', code); } catch (_) {}
    applyAll();
  }

  function getLang() { return _lang; }
  function getLanguages() { return _languages; }

  // ── Language picker overlay ───────────────────────────────────────────────

  function showPicker(onComplete) {
    if (document.getElementById('bbLangPicker')) return;

    var overlay = document.createElement('div');
    overlay.id = 'bbLangPicker';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:99999',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'background:linear-gradient(135deg,#ffaa33 0%,#ff8833 100%)',
      'padding:24px;box-sizing:border-box',
    ].join(';');

    var label = t('i18n.chooseLang');
    var btnLabel = t('i18n.continue');

    var html = '<div style="background:white;border-radius:20px;padding:24px;width:100%;max-width:340px;box-shadow:0 10px 40px rgba(0,0,0,0.2);">';
    html += '<div style="text-align:center;margin-bottom:20px;">';
    html += '<div style="font-size:2.2em;margin-bottom:8px;">🐻</div>';
    html += '<div style="font-size:1em;font-weight:700;color:#212529;">' + label + '</div>';
    html += '</div>';
    html += '<div id="bbLangList" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">';
    _languages.forEach(function (lg) {
      var sel = lg.code === _lang ? 'background:var(--brand-primary,#ff9500);color:white;border-color:var(--brand-primary,#ff9500);' : 'background:#f8f9fa;color:#212529;border-color:#e9ecef;';
      html += '<button data-lang="' + lg.code + '" style="padding:10px 8px;border:2px solid;border-radius:10px;font-size:0.9em;font-weight:600;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:all 0.15s;' + sel + '">' + lg.name + '</button>';
    });
    html += '</div>';
    html += '<button id="bbLangContinue" style="width:100%;padding:13px;background:var(--brand-primary,#ff9500);color:white;border:none;border-radius:12px;font-size:1em;font-weight:700;cursor:pointer;font-family:inherit;">' + btnLabel + '</button>';
    html += '</div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lang]');
      if (btn) {
        var code = btn.getAttribute('data-lang');
        setLanguage(code);
        overlay.querySelectorAll('[data-lang]').forEach(function (b) {
          var active = b.getAttribute('data-lang') === code;
          b.style.background = active ? 'var(--brand-primary,#ff9500)' : '#f8f9fa';
          b.style.color = active ? 'white' : '#212529';
          b.style.borderColor = active ? 'var(--brand-primary,#ff9500)' : '#e9ecef';
        });
        // Update continue button label in new language
        var cont = overlay.querySelector('#bbLangContinue');
        if (cont) cont.textContent = t('i18n.continue');
      }
      if (e.target.id === 'bbLangContinue') {
        overlay.remove();
        if (typeof onComplete === 'function') onComplete(_lang);
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function _detectBrowserLang() {
    var tags = (navigator.languages && navigator.languages.length)
      ? Array.prototype.slice.call(navigator.languages)
      : [navigator.language || 'en'];
    for (var i = 0; i < tags.length; i++) {
      var base = tags[i].toLowerCase().split('-')[0];
      if (_locales[base]) return base;
    }
    return 'en';
  }

  (function _init() {
    var saved = null;
    try { saved = localStorage.getItem('bbLanguage'); } catch (_) {}
    _lang = (saved && _locales[saved]) ? saved : _detectBrowserLang();

    document.addEventListener('DOMContentLoaded', function () {
      applyAll();
      // Show language picker for first-time users (no language saved yet)
      if (!saved) {
        var path = location.pathname;
        var isHome = path === '/' || path.endsWith('/index.html') || path.endsWith('/');
        var isAnon = path.endsWith('/anonymous.html') || (path.endsWith('/') && document.getElementById('screen-verify'));
        if (isHome || isAnon) {
          showPicker(function () {
            // After language selected, mark as seen and continue
            try { localStorage.setItem('bbLanguage', _lang); } catch (_) {}
          });
        }
      }
    });
  })();

  // ── Exports ───────────────────────────────────────────────────────────────

  window.BB = window.BB || {};
  window.BB.i18n = {
    t: t,
    applyAll: applyAll,
    setLanguage: setLanguage,
    getLang: getLang,
    getLanguages: getLanguages,
    showPicker: showPicker,
  };
  window.BB.t = t;

})();
