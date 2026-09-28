/* Paramètres généraux — valeurs par défaut, accès et formatage monétaire (section 8) */
window.PP = window.PP || {};

PP.settings = (() => {
  const DEFAUTS = {
    nomEtablissement: '',
    logo: '',                     // dataURL (PNG redimensionné)
    dateDebut: `${new Date().getFullYear()}-01-01`, // début d'utilisation du calendrier
    seuilHebdo: 40,               // seuil hebdomadaire déclenchant les heures supplémentaires
    maxEmployes: 50,              // nombre maximum d'employés gérés simultanément
    arrondi: 'minute',            // minute | quart | demi
    formatHeure: '24h',           // 24h | 12h
    formatDate: 'JJ/MM/AAAA',     // JJ/MM/AAAA | MM/JJ/AAAA
    langue: 'fr',
    devise: 'EUR',
    joursOuvres: [1, 2, 3, 4, 5], // 0 = dimanche … 6 = samedi
    majorationNuit: 25,           // %
    majorationDimanche: 50,       // %
    majorationFerie: 100,         // %
    contingentAnnuelHS: 220,      // heures
    intervalleSauvegardeAuto: 24, // heures entre deux sauvegardes automatiques (0 = désactivée)
    sessionMinutes: 30,           // expiration de session après inactivité (0 = jamais)
    heureReference: 540,          // heure d'arrivée de référence pour le rapport des retards (minutes)
    majorationHS: 25,             // majoration des heures supplémentaires (pour les estimations de paie)
    theme: 'sombre',              // sombre | clair
    texteAgrandi: false,          // lisibilité accrue (police 112,5 %)
    champsPersonnalises: [],      // [{ id, libelle }] — champs libres sur la fiche employé
  };

  /* ---------- Devises ----------
     `symbole`  ce qui est affiché après le montant
     `decimales` nombre de décimales — beaucoup de monnaies africaines et
                asiatiques n'en utilisent pas (franc CFA, yen, won, roupie…)
     `zone`     regroupement pour le menu déroulant des Paramètres

     Le franc CFA porte deux codes distincts (XOF Afrique de l'Ouest,
     XAF Afrique centrale) qui partagent le même symbole et la même parité :
     on les garde séparés car la comptabilité les distingue. */
  const DEVISES = {
    /* ---- Europe ---- */
    EUR: { symbole: '€', libelle: 'Euro', decimales: 2, zone: 'Europe' },
    CHF: { symbole: 'CHF', libelle: 'Franc suisse', decimales: 2, zone: 'Europe' },
    GBP: { symbole: '£', libelle: 'Livre sterling', decimales: 2, zone: 'Europe' },
    SEK: { symbole: 'kr', libelle: 'Couronne suédoise', decimales: 2, zone: 'Europe' },
    NOK: { symbole: 'kr', libelle: 'Couronne norvégienne', decimales: 2, zone: 'Europe' },
    DKK: { symbole: 'kr', libelle: 'Couronne danoise', decimales: 2, zone: 'Europe' },
    PLN: { symbole: 'zł', libelle: 'Zloty polonais', decimales: 2, zone: 'Europe' },
    CZK: { symbole: 'Kč', libelle: 'Couronne tchèque', decimales: 2, zone: 'Europe' },
    HUF: { symbole: 'Ft', libelle: 'Forint hongrois', decimales: 0, zone: 'Europe' },
    RON: { symbole: 'lei', libelle: 'Leu roumain', decimales: 2, zone: 'Europe' },
    BGN: { symbole: 'лв', libelle: 'Lev bulgare', decimales: 2, zone: 'Europe' },
    TRY: { symbole: '₺', libelle: 'Livre turque', decimales: 2, zone: 'Europe' },
    RUB: { symbole: '₽', libelle: 'Rouble russe', decimales: 2, zone: 'Europe' },
    UAH: { symbole: '₴', libelle: 'Hryvnia ukrainienne', decimales: 2, zone: 'Europe' },

    /* ---- Afrique de l'Ouest ---- */
    XOF: { symbole: 'F CFA', libelle: 'Franc CFA (UEMOA)', decimales: 0, zone: "Afrique de l'Ouest" },
    NGN: { symbole: '₦', libelle: 'Naira nigérian', decimales: 2, zone: "Afrique de l'Ouest" },
    GHS: { symbole: '₵', libelle: 'Cedi ghanéen', decimales: 2, zone: "Afrique de l'Ouest" },
    GMD: { symbole: 'D', libelle: 'Dalasi gambien', decimales: 2, zone: "Afrique de l'Ouest" },
    GNF: { symbole: 'FG', libelle: 'Franc guinéen', decimales: 0, zone: "Afrique de l'Ouest" },
    SLL: { symbole: 'Le', libelle: 'Leone sierra-léonais', decimales: 2, zone: "Afrique de l'Ouest" },
    LRD: { symbole: 'L$', libelle: 'Dollar libérien', decimales: 2, zone: "Afrique de l'Ouest" },
    CVE: { symbole: 'Esc', libelle: 'Escudo cap-verdien', decimales: 2, zone: "Afrique de l'Ouest" },
    MRU: { symbole: 'UM', libelle: 'Ouguiya mauritanien', decimales: 2, zone: "Afrique de l'Ouest" },

    /* ---- Afrique centrale ---- */
    XAF: { symbole: 'F CFA', libelle: 'Franc CFA (CEMAC)', decimales: 0, zone: 'Afrique centrale' },
    CDF: { symbole: 'FC', libelle: 'Franc congolais', decimales: 2, zone: 'Afrique centrale' },
    AOA: { symbole: 'Kz', libelle: 'Kwanza angolais', decimales: 2, zone: 'Afrique centrale' },
    STN: { symbole: 'Db', libelle: 'Dobra santoméen', decimales: 2, zone: 'Afrique centrale' },

    /* ---- Afrique du Nord ---- */
    MAD: { symbole: 'DH', libelle: 'Dirham marocain', decimales: 2, zone: 'Afrique du Nord' },
    DZD: { symbole: 'DA', libelle: 'Dinar algérien', decimales: 2, zone: 'Afrique du Nord' },
    TND: { symbole: 'DT', libelle: 'Dinar tunisien', decimales: 3, zone: 'Afrique du Nord' },
    LYD: { symbole: 'LD', libelle: 'Dinar libyen', decimales: 3, zone: 'Afrique du Nord' },
    EGP: { symbole: 'E£', libelle: 'Livre égyptienne', decimales: 2, zone: 'Afrique du Nord' },
    SDG: { symbole: 'ج.س', libelle: 'Livre soudanaise', decimales: 2, zone: 'Afrique du Nord' },

    /* ---- Afrique de l'Est ---- */
    KES: { symbole: 'KSh', libelle: 'Shilling kényan', decimales: 2, zone: "Afrique de l'Est" },
    TZS: { symbole: 'TSh', libelle: 'Shilling tanzanien', decimales: 2, zone: "Afrique de l'Est" },
    UGX: { symbole: 'USh', libelle: 'Shilling ougandais', decimales: 0, zone: "Afrique de l'Est" },
    RWF: { symbole: 'FRw', libelle: 'Franc rwandais', decimales: 0, zone: "Afrique de l'Est" },
    BIF: { symbole: 'FBu', libelle: 'Franc burundais', decimales: 0, zone: "Afrique de l'Est" },
    ETB: { symbole: 'Br', libelle: 'Birr éthiopien', decimales: 2, zone: "Afrique de l'Est" },
    SOS: { symbole: 'Sh', libelle: 'Shilling somalien', decimales: 2, zone: "Afrique de l'Est" },
    DJF: { symbole: 'Fdj', libelle: 'Franc djiboutien', decimales: 0, zone: "Afrique de l'Est" },
    ERN: { symbole: 'Nfk', libelle: 'Nakfa érythréen', decimales: 2, zone: "Afrique de l'Est" },
    SSP: { symbole: 'SSP', libelle: 'Livre sud-soudanaise', decimales: 2, zone: "Afrique de l'Est" },
    MGA: { symbole: 'Ar', libelle: 'Ariary malgache', decimales: 0, zone: "Afrique de l'Est" },
    MUR: { symbole: '₨', libelle: 'Roupie mauricienne', decimales: 2, zone: "Afrique de l'Est" },
    SCR: { symbole: '₨', libelle: 'Roupie seychelloise', decimales: 2, zone: "Afrique de l'Est" },
    KMF: { symbole: 'CF', libelle: 'Franc comorien', decimales: 0, zone: "Afrique de l'Est" },

    /* ---- Afrique australe ---- */
    ZAR: { symbole: 'R', libelle: 'Rand sud-africain', decimales: 2, zone: 'Afrique australe' },
    BWP: { symbole: 'P', libelle: 'Pula botswanais', decimales: 2, zone: 'Afrique australe' },
    NAD: { symbole: 'N$', libelle: 'Dollar namibien', decimales: 2, zone: 'Afrique australe' },
    ZMW: { symbole: 'ZK', libelle: 'Kwacha zambien', decimales: 2, zone: 'Afrique australe' },
    MWK: { symbole: 'MK', libelle: 'Kwacha malawite', decimales: 2, zone: 'Afrique australe' },
    MZN: { symbole: 'MT', libelle: 'Metical mozambicain', decimales: 2, zone: 'Afrique australe' },
    ZWL: { symbole: 'Z$', libelle: 'Dollar zimbabwéen', decimales: 2, zone: 'Afrique australe' },
    SZL: { symbole: 'E', libelle: 'Lilangeni swazi', decimales: 2, zone: 'Afrique australe' },
    LSL: { symbole: 'L', libelle: 'Loti lesothan', decimales: 2, zone: 'Afrique australe' },

    /* ---- Moyen-Orient ---- */
    AED: { symbole: 'د.إ', libelle: 'Dirham des Émirats', decimales: 2, zone: 'Moyen-Orient' },
    SAR: { symbole: '﷼', libelle: 'Riyal saoudien', decimales: 2, zone: 'Moyen-Orient' },
    QAR: { symbole: '﷼', libelle: 'Riyal qatari', decimales: 2, zone: 'Moyen-Orient' },
    KWD: { symbole: 'د.ك', libelle: 'Dinar koweïtien', decimales: 3, zone: 'Moyen-Orient' },
    BHD: { symbole: '.د.ب', libelle: 'Dinar bahreïni', decimales: 3, zone: 'Moyen-Orient' },
    OMR: { symbole: '﷼', libelle: 'Rial omanais', decimales: 3, zone: 'Moyen-Orient' },
    JOD: { symbole: 'د.ا', libelle: 'Dinar jordanien', decimales: 3, zone: 'Moyen-Orient' },
    ILS: { symbole: '₪', libelle: 'Shekel israélien', decimales: 2, zone: 'Moyen-Orient' },
    LBP: { symbole: 'ل.ل', libelle: 'Livre libanaise', decimales: 0, zone: 'Moyen-Orient' },
    IQD: { symbole: 'ع.د', libelle: 'Dinar irakien', decimales: 0, zone: 'Moyen-Orient' },
    IRR: { symbole: '﷼', libelle: 'Rial iranien', decimales: 0, zone: 'Moyen-Orient' },
    YER: { symbole: '﷼', libelle: 'Rial yéménite', decimales: 0, zone: 'Moyen-Orient' },

    /* ---- Asie du Sud ---- */
    INR: { symbole: '₹', libelle: 'Roupie indienne', decimales: 2, zone: 'Asie du Sud' },
    PKR: { symbole: '₨', libelle: 'Roupie pakistanaise', decimales: 2, zone: 'Asie du Sud' },
    BDT: { symbole: '৳', libelle: 'Taka bangladais', decimales: 2, zone: 'Asie du Sud' },
    LKR: { symbole: '₨', libelle: 'Roupie srilankaise', decimales: 2, zone: 'Asie du Sud' },
    NPR: { symbole: '₨', libelle: 'Roupie népalaise', decimales: 2, zone: 'Asie du Sud' },
    AFN: { symbole: '؋', libelle: 'Afghani afghan', decimales: 2, zone: 'Asie du Sud' },
    MVR: { symbole: 'Rf', libelle: 'Rufiyaa maldivienne', decimales: 2, zone: 'Asie du Sud' },
    BTN: { symbole: 'Nu.', libelle: 'Ngultrum bhoutanais', decimales: 2, zone: 'Asie du Sud' },

    /* ---- Asie du Sud-Est ---- */
    VND: { symbole: '₫', libelle: 'Dong vietnamien', decimales: 0, zone: 'Asie du Sud-Est' },
    THB: { symbole: '฿', libelle: 'Baht thaïlandais', decimales: 2, zone: 'Asie du Sud-Est' },
    IDR: { symbole: 'Rp', libelle: 'Roupie indonésienne', decimales: 0, zone: 'Asie du Sud-Est' },
    MYR: { symbole: 'RM', libelle: 'Ringgit malaisien', decimales: 2, zone: 'Asie du Sud-Est' },
    SGD: { symbole: 'S$', libelle: 'Dollar de Singapour', decimales: 2, zone: 'Asie du Sud-Est' },
    PHP: { symbole: '₱', libelle: 'Peso philippin', decimales: 2, zone: 'Asie du Sud-Est' },
    KHR: { symbole: '៛', libelle: 'Riel cambodgien', decimales: 0, zone: 'Asie du Sud-Est' },
    LAK: { symbole: '₭', libelle: 'Kip laotien', decimales: 0, zone: 'Asie du Sud-Est' },
    MMK: { symbole: 'K', libelle: 'Kyat birman', decimales: 0, zone: 'Asie du Sud-Est' },
    BND: { symbole: 'B$', libelle: 'Dollar de Brunei', decimales: 2, zone: 'Asie du Sud-Est' },
    TWD: { symbole: 'NT$', libelle: 'Dollar taïwanais', decimales: 2, zone: 'Asie du Sud-Est' },

    /* ---- Asie de l'Est ---- */
    CNY: { symbole: '¥', libelle: 'Yuan chinois', decimales: 2, zone: "Asie de l'Est" },
    JPY: { symbole: '¥', libelle: 'Yen japonais', decimales: 0, zone: "Asie de l'Est" },
    KRW: { symbole: '₩', libelle: 'Won sud-coréen', decimales: 0, zone: "Asie de l'Est" },
    KPW: { symbole: '₩', libelle: 'Won nord-coréen', decimales: 0, zone: "Asie de l'Est" },
    HKD: { symbole: 'HK$', libelle: 'Dollar de Hong Kong', decimales: 2, zone: "Asie de l'Est" },
    MOP: { symbole: 'MOP$', libelle: 'Pataca de Macao', decimales: 2, zone: "Asie de l'Est" },
    MNT: { symbole: '₮', libelle: 'Tugrik mongol', decimales: 0, zone: "Asie de l'Est" },

    /* ---- Asie centrale ---- */
    KZT: { symbole: '₸', libelle: 'Tenge kazakh', decimales: 2, zone: 'Asie centrale' },
    UZS: { symbole: 'so\'m', libelle: 'Sum ouzbek', decimales: 0, zone: 'Asie centrale' },
    KGS: { symbole: 'сом', libelle: 'Som kirghize', decimales: 2, zone: 'Asie centrale' },
    TJS: { symbole: 'SM', libelle: 'Somoni tadjik', decimales: 2, zone: 'Asie centrale' },
    TMT: { symbole: 'm', libelle: 'Manat turkmène', decimales: 2, zone: 'Asie centrale' },
    AZN: { symbole: '₼', libelle: 'Manat azerbaïdjanais', decimales: 2, zone: 'Asie centrale' },

    /* ---- Amériques ---- */
    USD: { symbole: '$', libelle: 'Dollar américain', decimales: 2, zone: 'Amériques' },
    CAD: { symbole: '$', libelle: 'Dollar canadien', decimales: 2, zone: 'Amériques' },
    MXN: { symbole: '$', libelle: 'Peso mexicain', decimales: 2, zone: 'Amériques' },
    BRL: { symbole: 'R$', libelle: 'Réal brésilien', decimales: 2, zone: 'Amériques' },
    ARS: { symbole: '$', libelle: 'Peso argentin', decimales: 2, zone: 'Amériques' },
    CLP: { symbole: '$', libelle: 'Peso chilien', decimales: 0, zone: 'Amériques' },
    COP: { symbole: '$', libelle: 'Peso colombien', decimales: 0, zone: 'Amériques' },
    PEN: { symbole: 'S/', libelle: 'Sol péruvien', decimales: 2, zone: 'Amériques' },
    UYU: { symbole: '$U', libelle: 'Peso uruguayen', decimales: 2, zone: 'Amériques' },
    BOB: { symbole: 'Bs', libelle: 'Boliviano', decimales: 2, zone: 'Amériques' },
    PYG: { symbole: '₲', libelle: 'Guarani paraguayen', decimales: 0, zone: 'Amériques' },
    VES: { symbole: 'Bs.S', libelle: 'Bolívar vénézuélien', decimales: 2, zone: 'Amériques' },
    DOP: { symbole: 'RD$', libelle: 'Peso dominicain', decimales: 2, zone: 'Amériques' },
    HTG: { symbole: 'G', libelle: 'Gourde haïtienne', decimales: 2, zone: 'Amériques' },
    CUP: { symbole: '$', libelle: 'Peso cubain', decimales: 2, zone: 'Amériques' },
    JMD: { symbole: 'J$', libelle: 'Dollar jamaïcain', decimales: 2, zone: 'Amériques' },
    TTD: { symbole: 'TT$', libelle: 'Dollar de Trinité', decimales: 2, zone: 'Amériques' },
    XCD: { symbole: 'EC$', libelle: 'Dollar des Caraïbes orientales', decimales: 2, zone: 'Amériques' },
    GTQ: { symbole: 'Q', libelle: 'Quetzal guatémaltèque', decimales: 2, zone: 'Amériques' },
    HNL: { symbole: 'L', libelle: 'Lempira hondurien', decimales: 2, zone: 'Amériques' },
    NIO: { symbole: 'C$', libelle: 'Córdoba nicaraguayen', decimales: 2, zone: 'Amériques' },
    CRC: { symbole: '₡', libelle: 'Colón costaricien', decimales: 2, zone: 'Amériques' },
    PAB: { symbole: 'B/.', libelle: 'Balboa panaméen', decimales: 2, zone: 'Amériques' },

    /* ---- Océanie ---- */
    AUD: { symbole: 'A$', libelle: 'Dollar australien', decimales: 2, zone: 'Océanie' },
    NZD: { symbole: 'NZ$', libelle: 'Dollar néo-zélandais', decimales: 2, zone: 'Océanie' },
    FJD: { symbole: 'FJ$', libelle: 'Dollar fidjien', decimales: 2, zone: 'Océanie' },
    PGK: { symbole: 'K', libelle: 'Kina papouan', decimales: 2, zone: 'Océanie' },
    WST: { symbole: 'WS$', libelle: 'Tala samoan', decimales: 2, zone: 'Océanie' },
    TOP: { symbole: 'T$', libelle: 'Pa\'anga tongien', decimales: 2, zone: 'Océanie' },
    VUV: { symbole: 'VT', libelle: 'Vatu vanuatuan', decimales: 0, zone: 'Océanie' },
    SBD: { symbole: 'SI$', libelle: 'Dollar des Salomon', decimales: 2, zone: 'Océanie' },
    XPF: { symbole: '₣', libelle: 'Franc pacifique (CFP)', decimales: 0, zone: 'Océanie' },
  };

  /* Noms courants supplémentaires, pour que la recherche réponde aussi aux
     appellations locales ou aux graphies sans accent. Ils ne s'affichent pas :
     ils servent uniquement au filtrage.

     Exemple : chercher « rupiah » doit trouver IDR, dont le libellé français est
     « Roupie indonésienne ». */
  const ALIAS = {
    IDR: 'rupiah rupiahs',
    INR: 'rupee rupees',
    PKR: 'rupee rupees',
    LKR: 'rupee rupees',
    NPR: 'rupee rupees',
    MUR: 'rupee rupees',
    SCR: 'rupee rupees',
    JPY: 'yen',
    CNY: 'yuan renminbi rmb',
    KRW: 'won',
    KPW: 'won',
    VND: 'dong',
    THB: 'baht',
    MYR: 'ringgit',
    PHP: 'peso pesos',
    MXN: 'peso pesos',
    ARS: 'peso pesos',
    CLP: 'peso pesos',
    COP: 'peso pesos',
    UYU: 'peso pesos',
    DOP: 'peso pesos',
    CUP: 'peso pesos',
    XOF: 'franc cfa uemoa senegal cote ivoire mali burkina niger benin togo',
    XAF: 'franc cfa cemac cameroun gabon congo tchad centrafrique',
    XPF: 'franc cfp pacifique polynesie nouvelle-caledonie',
    KES: 'shilling shillings',
    TZS: 'shilling shillings',
    UGX: 'shilling shillings',
    SOS: 'shilling shillings',
    MAD: 'dirham',
    AED: 'dirham',
    DZD: 'dinar',
    TND: 'dinar',
    LYD: 'dinar',
    KWD: 'dinar',
    BHD: 'dinar',
    JOD: 'dinar',
    IQD: 'dinar',
    RSD: 'dinar',
    SAR: 'riyal rial',
    QAR: 'riyal rial',
    OMR: 'rial',
    IRR: 'rial',
    YER: 'rial',
    EGP: 'livre egyptienne pound',
    LBP: 'livre libanaise pound',
    SDG: 'livre soudanaise pound',
    SSP: 'livre sud-soudanaise pound',
    ZAR: 'rand',
    NGN: 'naira',
    GHS: 'cedi',
    ETB: 'birr',
    GNF: 'franc guineen',
    CDF: 'franc congolais',
    RWF: 'franc rwandais',
    BIF: 'franc burundais',
    DJF: 'franc djiboutien',
    KMF: 'franc comorien',
    MGA: 'ariary',
    KZT: 'tenge tengue',
    UZS: 'sum soum',
    KGS: 'som soum',
    TJS: 'somoni',
    TMT: 'manat',
    AZN: 'manat',
    RUB: 'rouble ruble',
    UAH: 'hryvnia grivna',
    TRY: 'livre turque lira',
    ILS: 'shekel sheqel',
    BRL: 'real reais',
    PEN: 'sol soles',
    BOB: 'boliviano',
    PYG: 'guarani',
    VES: 'bolivar',
    HTG: 'gourde',
    GTQ: 'quetzal',
    HNL: 'lempira',
    NIO: 'cordoba',
    CRC: 'colon',
    PAB: 'balboa',
    PLN: 'zloty',
    CZK: 'couronne koruna',
    HUF: 'forint',
    RON: 'leu lei',
    BGN: 'lev leve',
    DKK: 'couronne krone',
    NOK: 'couronne krone',
    SEK: 'couronne krona',
    ISK: 'couronne krona',
    AUD: 'dollar australien',
    NZD: 'dollar neo-zelandais',
    FJD: 'dollar fidjien',
    PGK: 'kina',
    WST: 'tala',
    TOP: 'paanga',
    VUV: 'vatu',
  };

  /* Retire les accents pour que « cote d'ivoire » trouve « Côte d'Ivoire » */
  const sansAccent = (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  /* Ordre d'affichage des zones dans le menu déroulant */
  const ZONES = [
    'Europe',
    "Afrique de l'Ouest", 'Afrique centrale', 'Afrique du Nord', "Afrique de l'Est", 'Afrique australe',
    'Moyen-Orient',
    'Asie du Sud', "Asie du Sud-Est", "Asie de l'Est", 'Asie centrale',
    'Amériques', 'Océanie',
  ];

  /* L'ancien code exposait `SYMBOLES` sous forme { CODE: symbole } : on garde
     cette vue pour ne rien casser, mais la source de vérité est `DEVISES`. */
  const SYMBOLES = Object.fromEntries(Object.entries(DEVISES).map(([code, d]) => [code, d.symbole]));

  const all = () => ({ ...DEFAUTS, ...(PP.store.get('settings') || {}) });
  const get = (cle) => all()[cle];
  const save = (patch) => PP.store.set('settings', { ...all(), ...patch });

  const deviseCourante = () => DEVISES[all().devise] || DEVISES.EUR;

  /** Devises groupées par zone, pour construire le menu déroulant. */
  const devisesParZone = () => ZONES
    .map((zone) => ({
      zone,
      devises: Object.entries(DEVISES)
        .filter(([, d]) => d.zone === zone)
        .sort((a, b) => a[1].libelle.localeCompare(b[1].libelle, 'fr')),
    }))
    .filter((g) => g.devises.length);

  /* Index de recherche, calculé une fois : « xof niger cfa » doit trouver XOF.
     On y met le code, le libellé, le symbole, la zone et les alias. */
  const INDEX = Object.fromEntries(Object.entries(DEVISES).map(([code, d]) => [
    code,
    sansAccent([code, d.libelle, d.symbole, d.zone, ALIAS[code] || ''].join(' ')),
  ]));

  /**
   * Vrai si la devise correspond à la recherche.
   * Le rapprochement se fait sur des MOTS ENTIERS et non sur des sous-chaînes :
   * sans cela, chercher « yen » remonterait « Libye » et « Koweït », et
   * « franc » ne distinguerait pas « franc pacifique » de « franc suisse ».
   * Chaque mot saisi doit être présent — « afrique ouest » affine donc la zone.
   */
  const deviseCorrespond = (code, requete) => {
    const mots = sansAccent(requete).split(/\s+/).filter(Boolean);
    if (!mots.length) return true;
    const champs = (INDEX[code] || '').split(/[^a-z0-9$€£¥₦₵₲₡₱₩₫฿៛₭₮₸₼₴₽₺₪]+/).filter(Boolean);
    return mots.every((mot) => champs.some((champ) => champ === mot || champ.startsWith(mot)));
  };

  /**
   * Formate un montant selon la devise configurée.
   * 18.5 → « 18,50 € » (EUR) · « 12 500 F CFA » (XOF) · « 1 850 ¥ » (JPY)
   * `decimales` de la devise décide de l'arrondi : les monnaies sans subdivision
   * (franc CFA, yen, won, roupie indonésienne…) sont arrondies à l'unité, ce qui
   * évite d'afficher des centimes qui n'existent pas.
   */
  const formaterMonetaire = (valeur) => {
    const d = deviseCourante();
    const nombre = Number(valeur);
    if (!Number.isFinite(nombre)) return `— ${d.symbole}`;
    const montant = nombre.toFixed(d.decimales).replace('.', ',');
    return `${montant} ${d.symbole}`;
  };

  /** Informations sur la devise configurée (symbole, libellé, décimales, zone). */
  const devise = () => ({ code: all().devise, ...deviseCourante() });

  return {
    DEFAUTS, DEVISES, SYMBOLES, ZONES, ALIAS, devisesParZone, deviseCorrespond, devise, deviseCourante,
    all, get, save, formaterMonetaire,
  };
})();
