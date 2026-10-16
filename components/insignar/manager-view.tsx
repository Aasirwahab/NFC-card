import { five } from '@/app/(landing)/insignar/copy';

export function ManagerView() {
  const m = five.manager;
  return (
    <div className="mgr">
      <p className="fig">{m.label}</p>
      <div className="stats">
        {m.stats.map((s) => (
          <div key={s.l} data-rv>
            <b>{s.v}</b>
            <span>{s.l}</span>
          </div>
        ))}
      </div>
      <ul className="alerts" aria-label={m.alertsTitle}>
        {m.alerts.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <p className="note">
        {m.note} <span className="tag ex">{m.example}</span>
      </p>
    </div>
  );
}
