import StatusBadge from './StatusBadge.jsx';

const realityCopy = {
  live: { tone: 'live', label: 'Live' },
  simulated: { tone: 'neutral', label: 'Simulated' },
  operator: { tone: 'primary', label: 'Operator executes' },
  comparison: { tone: 'warning', label: 'Comparison only' },
};

export default function RealityBadge({ kind, label, ...props }) {
  const content = realityCopy[kind] ?? realityCopy.simulated;

  return (
    <StatusBadge {...props} tone={content.tone}>
      {label ?? content.label}
    </StatusBadge>
  );
}
