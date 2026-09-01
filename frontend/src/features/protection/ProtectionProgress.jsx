const steps = ['Configure', 'Review', 'Status'];

export default function ProtectionProgress({ current }) {
  const activeIndex = steps.indexOf(current);

  return (
    <ol className="protection-progress" aria-label="Protection request progress">
      {steps.map((step, index) => (
        <li
          key={step}
          className={index === activeIndex ? 'is-current' : index < activeIndex ? 'is-complete' : ''}
          aria-current={index === activeIndex ? 'step' : undefined}
        >
          <span>{index < activeIndex ? '✓' : index + 1}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  );
}
