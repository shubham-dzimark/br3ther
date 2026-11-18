type IconProps = { className?: string };

const base = "h-[18px] w-[18px] shrink-0";

function Svg({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? base}
    >
      {children}
    </svg>
  );
}

/** Lab Results: a lab flask. */
export const IconFlask = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3h6M10 3v6.5L4.8 18.2A1.9 1.9 0 0 0 6.4 21h11.2a1.9 1.9 0 0 0 1.6-2.8L14 9.5V3" />
    <path d="M7.5 15h9" />
  </Svg>
);

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Svg>
);

export const IconOrders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h4" />
  </Svg>
);

export const IconProducts = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 8 12 3 3 8l9 5 9-5Z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </Svg>
);

export const IconCategories = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Svg>
);

export const IconCustomers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.5a3.2 3.2 0 0 1 0 6" />
    <path d="M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);

export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Svg>
);

export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z" />
    <circle cx="17" cy="14" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const IconTruck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a1 1 0 0 1 1-1h9v10H4a1 1 0 0 1-1-1Z" />
    <path d="M13 10h4l3 3v3h-7Z" />
    <circle cx="7.5" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </Svg>
);

export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-5 3 3 5-7" />
  </Svg>
);

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </Svg>
);

export const IconCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </Svg>
);

export const IconRefund = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Svg>
);

export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1 14h6M9 8h6M17 16h6" />
  </Svg>
);

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M9 22V12h6v10" />
  </Svg>
);

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 12.5 5 5L20 6.5" />
  </Svg>
);

export const IconDots = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);

export const IconPrinter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V3h10v6" />
    <path d="M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <rect x="7" y="15" width="10" height="6" rx="1" />
  </Svg>
);

/** Invoice: a document with money on it. */
export const IconInvoice = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="M12 11v7" />
    <path d="M14 12.5h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-3" />
  </Svg>
);

/** Packing slip: a clipboard with picking lines. */
export const IconClipboard = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
    <rect x="9" y="2.5" width="6" height="4" rx="1" />
    <path d="M9 12h6M9 16h4" />
  </Svg>
);

/** A prize wheel: spokes in a circle with the pointer at the top. */
export const IconWheel = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 5v16M4 13h16M6.3 7.3l11.4 11.4M17.7 7.3 6.3 18.7" />
    <path d="M12 2.5 10.2 5h3.6L12 2.5Z" />
  </Svg>
);

export const IconBan = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </Svg>
);

/* ---------------------------------------------------------------------------
 * Distinct nav icons. The sidebar previously reused IconTag for ten different
 * menu items and IconFile for six, which made the menu hard to scan - every
 * entry below is used by exactly one thing.
 * ------------------------------------------------------------------------ */

/** Message / conversation. Deliberately unlike IconBell so the inbox and the
 *  notification bell are never confused for each other. */
export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3-.5L3.5 21l1.2-3.4A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
  </Svg>
);

export const IconHeadset = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <rect x="2.5" y="13" width="4" height="6" rx="1.6" />
    <rect x="17.5" y="13" width="4" height="6" rx="1.6" />
    <path d="M20 19v.5a2.5 2.5 0 0 1-2.5 2.5H13" />
  </Svg>
);

export const IconRobot = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 4v4M9 14h.01M15 14h.01M9.5 17.5h5" />
    <circle cx="12" cy="3" r="1.2" />
    <path d="M2.5 12.5v3M21.5 12.5v3" />
  </Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" />
  </Svg>
);

/** SEO: a magnifier over a rising bar chart. */
export const IconSeo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.4-4.4" />
    <path d="M8 12.5v-2M10.5 12.5v-4M13 12.5v-3" />
  </Svg>
);

export const IconCoupon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a2 2 0 0 0 0 3v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-2a2 2 0 0 0 0-3v-2Z" />
    <path d="M14 8v1.5M14 14.5V16" strokeDasharray="2 2" />
  </Svg>
);

export const IconGiftCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
    <path d="M2.5 10h19" />
    <path d="M9 5.5v13" />
    <path d="M9 10s-1.2-2.8-3-2.8a1.4 1.4 0 0 0 0 2.8M9 10s1.2-2.8 3-2.8a1.4 1.4 0 0 1 0 2.8" />
  </Svg>
);

export const IconGift = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="9" width="18" height="4" rx="1" />
    <path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 9v12" />
    <path d="M12 9S10.5 3 8 3a2.2 2.2 0 0 0 0 6M12 9s1.5-6 4-6a2.2 2.2 0 0 1 0 6" />
  </Svg>
);

export const IconBolt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13L13.5 2Z" />
  </Svg>
);

export const IconBadge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 14.6 5l3.5-.2.4 3.5 2.5 2.5-2.5 2.5-.4 3.5-3.5-.2L12 19l-2.6-2.4-3.5.2-.4-3.5L3 10.8l2.5-2.5.4-3.5L9.4 5 12 2.5Z" />
    <path d="m9.5 10.8 1.8 1.8 3.4-3.4" />
  </Svg>
);

export const IconPercent = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 18 12-12" />
    <circle cx="7.5" cy="7.5" r="2.5" />
    <circle cx="16.5" cy="16.5" r="2.5" />
  </Svg>
);

export const IconMegaphone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11v2a2 2 0 0 0 2 2h2l8 4.5V6.5L7 11H5a2 2 0 0 0-2 2Z" />
    <path d="M18 9.5a3.5 3.5 0 0 1 0 5M7 15v4.5a1.5 1.5 0 0 0 3 0V16.7" />
  </Svg>
);

export const IconPopup = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="14" height="11" rx="2" />
    <path d="M2.5 7.5h14" />
    <rect x="9.5" y="11" width="12" height="9" rx="2" fill="currentColor" fillOpacity="0.08" />
  </Svg>
);

export const IconHeader = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
    <path d="M6.5 6.5h4" />
  </Svg>
);

export const IconFooter = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 15h18" />
    <path d="M6.5 17.5h4" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z" />
    <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
    <path d="M8 7.5h7M8 11h5" />
  </Svg>
);

export const IconUserCheck = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8" r="3.8" />
    <path d="M2.5 20a7 7 0 0 1 14 0" />
    <path d="m16.5 11.5 1.8 1.8 3.4-3.4" />
  </Svg>
);

export const IconKey = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="m11.5 12 8-8M17 6.5l2 2M14.5 9l2 2" />
  </Svg>
);

export const IconReceipt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 2.5h14v19l-2.3-1.6-2.3 1.6-2.4-1.6-2.3 1.6L7.3 20.9 5 22.5v-20Z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Svg>
);

export const IconWithdraw = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
    <path d="M12 9.5v6M9.5 13l2.5 2.5 2.5-2.5" />
  </Svg>
);

export const IconTrendingUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 16 5.5-5.5 3.5 3.5L21 5" />
    <path d="M15.5 5H21v5.5" />
    <path d="M3 21h18" />
  </Svg>
);

export const IconTrophy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5.5H4.5V7a3.5 3.5 0 0 0 3 3.4M17 5.5h2.5V7a3.5 3.5 0 0 1-3 3.4" />
    <path d="M12 14v3.5M8.5 20.5h7l-.7-3h-5.6l-.7 3Z" />
  </Svg>
);

export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4" />
  </Svg>
);

export const IconBoxes = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="12.5" width="8" height="8" rx="1.5" />
    <rect x="13.5" y="12.5" width="8" height="8" rx="1.5" />
    <rect x="8" y="3.5" width="8" height="8" rx="1.5" />
  </Svg>
);

export const IconWrench = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 3a5.5 5.5 0 0 0-5 7.7L3.6 17.6a2 2 0 0 0 2.8 2.8l6.9-6.9A5.5 5.5 0 0 0 20.5 6l-3 3-2.5-2.5 3-3A5.5 5.5 0 0 0 15.5 3Z" />
  </Svg>
);

export const IconDatabase = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
    <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Svg>
);

export const IconIdCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <circle cx="8.5" cy="11" r="2.2" />
    <path d="M5 16.2a3.8 3.8 0 0 1 7 0M14.5 10h4M14.5 13.5h4" />
  </Svg>
);

export const IconStore = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 9.5 5 4h14l1.5 5.5a3 3 0 0 1-5.7 1.6 3 3 0 0 1-5.6 0 3 3 0 0 1-5.7-1.6Z" />
    <path d="M5 12v7.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V12" />
    <path d="M10 20v-4.5h4V20" />
  </Svg>
);

export const IconPalette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z" />
    <path d="M7.5 12h.01M9.5 8h.01M14 7.5h.01M17 10.5h.01" />
  </Svg>
);

export const IconCoins = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="8.5" cy="6.5" rx="5.5" ry="2.5" />
    <path d="M3 6.5v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4" />
    <path d="M14 11.2c3.7.2 7 1.2 7 2.8v4c0 1.4-2.5 2.5-5.5 2.5S10 19.4 10 18v-2.6" />
  </Svg>
);

/** Knowledge base: a book with a question mark, distinct from the blog's book. */
export const IconBook2 = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5v-14Z" />
    <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
    <path d="M10 8.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.9.6-.9 1.2v.4M11.5 14h.01" />
  </Svg>
);

/** Assistant insights: a chart inside a speech bubble. */
export const IconTrendingUp2 = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3-.5L3.5 21l1.2-3.4A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
    <path d="M8 13.5v-2M11.5 13.5v-4M15 13.5v-3" />
  </Svg>
);

/** Chat triggers: a bolt inside a speech bubble. */
export const IconBolt2 = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3-.5L3.5 21l1.2-3.4A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
    <path d="M12.8 6.5 9.5 11.8h2.7l-.4 3.7 3.4-4.6h-2.7l.3-4.4Z" />
  </Svg>
);

/** Checkout Upsell: a shopping cart with sales rising out of it. */
export const IconCartUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 6.5h1.9a1.2 1.2 0 0 1 1.2 1l.2 1.4" />
    <path d="M5.6 10.5h15.9L19.6 17H7.6Z" />
    <circle cx="9.6" cy="20" r="1.4" />
    <circle cx="17.6" cy="20" r="1.4" />
    <path d="M10 10.5V4.6M8.4 6.2 10 4.6l1.6 1.6" />
    <path d="M13.7 10.5V2M12.1 3.6 13.7 2l1.6 1.6" />
    <path d="M17.4 10.5V4.6M15.8 6.2l1.6-1.6L19 6.2" />
  </Svg>
);

/** Hero banners: a wide image with a caption bar. */
export const IconImage2 = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <circle cx="8" cy="10" r="1.6" />
    <path d="m3.5 16.5 4.2-3.6a1.6 1.6 0 0 1 2.1 0l3 2.6M14 15l2-1.6a1.6 1.6 0 0 1 2 0l2.5 2.1" />
  </Svg>
);
