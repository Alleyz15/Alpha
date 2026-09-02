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
    body: 'The quoted price is fixed during review. Alpha shows the selected protection, maximum loss, expiry, and any unprotected amount before a request is made.',
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
      'There is no user deposit flow in this prototype.',
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
