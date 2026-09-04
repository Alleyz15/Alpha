export const benefits = [
  {
    number: '01',
    title: 'Choose the outcome',
    body: 'Tell Alpha how much of your asset you want to protect, the downside level you prefer, and the date you need.',
  },
  {
    number: '02',
    title: 'Compare live choices',
    body: 'Alpha shows only the protection choices returned by the live backend—never invented floors, costs, or end dates.',
  },
  {
    number: '03',
    title: 'Verify the result',
    body: 'When a purchase is completed on Base, Alpha shows the transaction evidence returned by the backend.',
  },
];

export const identityStatements = [
  'Plain-language protection',
  'Live-market driven',
  'Verifiable on Base',
  'Honest about simulation',
];

export const journeySteps = [
  {
    number: '01',
    title: 'Read the live market',
    body: 'Alpha checks current prices and protection availability for every asset currently offered by the live backend.',
    label: 'Live market context',
  },
  {
    number: '02',
    title: 'Describe the protection',
    body: 'Choose the amount to protect, a downside target, and the end date. No trading terminology is required.',
    label: 'Plain-language configuration',
  },
  {
    number: '03',
    title: 'Compare available choices',
    body: 'The backend returns the actual price floors, protected amounts, amounts paid, and end dates currently available.',
    label: 'Backend-issued choices',
  },
  {
    number: '04',
    title: 'Review before continuing',
    body: 'The quoted price is fixed during review. Alpha shows the selected protection, maximum loss, end date, and any unprotected amount before a request is made.',
    label: 'Fixed quote review',
  },
  {
    number: '05',
    title: 'Request operator execution',
    body: 'The application operator performs safety checks and executes the purchase. A request is not called on-chain until the backend returns transaction evidence.',
    label: 'Operator executes purchase',
  },
  {
    number: '06',
    title: 'Track the position',
    body: 'Alpha records the amount, price floor, end date, payment status, execution status, and BaseScan link when one is available.',
    label: 'Position tracking',
  },
];

export const expansionCards = [
  {
    id: 'lending',
    title: 'Borrow against your protection',
    body: 'Already have a protected position? Borrow USDC against it without selling early or giving up your floor. How much you can borrow comes from the protection itself, not a separate credit check.',
    // The numbered form is the page's existing language for "here is the
    // sequence" - the same 01/02/03 the benefits cards use.
    steps: [
      {
        number: '01',
        title: 'Start with protection you hold',
        body: 'Your protected position stays yours, floor included. Nothing is sold.',
      },
      {
        number: '02',
        title: 'See what your floor supports',
        body: 'The amount you can borrow is worked out from that floor, not from a credit check.',
      },
      {
        number: '03',
        title: 'Borrow and repay on Base',
        body: 'Both transfers are real, and both can be checked on BaseScan.',
      },
    ],
    ctaLabel: 'Explore lending',
    href: '/lending',
  },
  {
    id: 'vault',
    title: 'A deposit that comes back whole',
    body: 'Deposit USDC and get the full amount back at the end of the term. Part of it funds a real position on Base, so you can share in the upside if the market moves — with no risk to your principal.',
    steps: [
      {
        number: '01',
        title: 'Deposit USDC',
        body: 'You see the term and how the deposit is split before you confirm.',
      },
      {
        number: '02',
        title: 'Part of it buys a real position',
        body: 'The rest is set aside so the full deposit can come back at the end.',
      },
      {
        number: '03',
        title: 'Get the whole deposit back',
        body: 'Plus a share of any rise. The deposit is guaranteed; the share of the rise is not.',
      },
    ],
    ctaLabel: 'Explore the vault',
    href: '/vault',
  },
];

export const realityGroups = [
  {
    kind: 'live',
    eyebrow: 'LIVE AND VERIFIABLE',
    title: 'What comes from real systems',
    items: [
      'Market prices and protection availability come from live sources.',
      'Protection choices are issued by the backend from the live market.',
      'When a purchase is completed on Base, Alpha displays the BaseScan evidence returned by the backend.',
      'Settlement evidence is read from the protocol and recorded by Alpha.',
    ],
  },
  {
    kind: 'simulated',
    eyebrow: 'SIMULATED FOR THE DEMO',
    title: 'What is demonstration data',
    items: [
      'Displayed user holdings are demonstration data.',
      'Vault deposits spend from a simulated USDC balance to buy a real position on Base.',
      'A simulated holding is never presented as an on-chain deposit.',
    ],
  },
  {
    kind: 'operator',
    eyebrow: 'OPERATOR EXECUTED',
    title: 'Who completes the purchase',
    items: [
      'The application operator controls the wallet used to purchase protection.',
      'The user submits a request; the operator executes it after safety checks.',
      'A request is not described as on-chain until a transaction has been returned by the backend.',
    ],
  },
];
