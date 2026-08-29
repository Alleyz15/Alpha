// Three screens, no router, no state manager (see docs/IMPLEMENT.md Phase 5).
// Screen switching, data flow and animation are added in Phase 5 - this is
// scaffolding only.
import QuoteScreen from './screens/QuoteScreen.jsx';
import ConfirmationScreen from './screens/ConfirmationScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';

export default function App() {
  return (
    <main>
      <h1>Alpha</h1>
      {/* Placeholder: Phase 5 decides how the three screens are shown. */}
      <QuoteScreen />
      <ConfirmationScreen />
      <DashboardScreen />
    </main>
  );
}
