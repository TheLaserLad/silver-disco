export default function HowPointsWork() {
  return (
    <div style={{
      background: '#000000',
      minHeight: '100vh',
      color: '#f0f0f0',
      fontFamily: "'Arial', 'Barlow Condensed', sans-serif",
      padding: '0 0 80px 0',
      overflowX: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Arial:wght@400;500;600;700&family=Inter:wght@700;900&display=swap');

        .pts-hero {
          position: relative;
          padding: 64px 24px 48px;
          text-align: center;
          overflow: hidden;
        }
        .pts-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(146,52,235,0.25) 0%, transparent 70%);
          pointer-events: none;
        }
        .pts-eyebrow {
          display: inline-block;
          font-family: 'Inter', monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #9234eb;
          border: 1px solid rgba(146,52,235,0.4);
          padding: 6px 16px;
          border-radius: 2px;
          margin-bottom: 20px;
        }
        .pts-title {
          font-family: 'Inter', monospace;
          font-size: clamp(28px, 6vw, 52px);
          font-weight: 900;
          letter-spacing: -0.02em;
          line-height: 1.05;
          margin: 0 0 16px;
          background: linear-gradient(135deg, #ffffff 0%, #c084fc 60%, #9234eb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .pts-subtitle {
          font-size: 17px;
          color: rgba(240,240,240,0.55);
          max-width: 540px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .pts-divider {
          width: 60px;
          height: 2px;
          background: linear-gradient(90deg, #9234eb, transparent);
          margin: 32px auto 0;
        }
        .pts-hint {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 20px;
        }
        .pts-hint-box {
          background: rgba(146,52,235,0.08);
          border: 1px solid rgba(146,52,235,0.25);
          border-left: 3px solid #9234eb;
          border-radius: 4px;
          padding: 16px 20px;
          font-size: 15px;
          color: rgba(240,240,240,0.75);
          line-height: 1.6;
          margin-bottom: 0;
        }

        .pts-section-label {
          font-family: 'Inter', monospace;
          font-size: 10px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #9234eb;
          display: flex;
          align-items: center;
          gap: 12px;
          max-width: 680px;
          padding: 0 20px;
          margin: 40px auto 24px;
        }
        .pts-section-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(146,52,235,0.25);
        }

        .pts-tables {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 520px) {
          .pts-tables { grid-template-columns: 1fr; }
        }
        .pts-table-card {
          background: #121212;
          border: 1px solid rgba(146,52,235,0.2);
          border-radius: 8px;
          overflow: hidden;
        }
        .pts-table-head {
          padding: 16px 18px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: relative;
        }
        .pts-table-head::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
        }
        .pts-table-head.live::before { background: linear-gradient(90deg, #ef4444, transparent); }
        .pts-table-head.demand::before { background: linear-gradient(90deg, #9234eb, transparent); }
        .pts-table-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .pts-table-dot.live { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,0.6); }
        .pts-table-dot.demand { background: #9234eb; box-shadow: 0 0 6px rgba(146,52,235,0.6); }
        .pts-table-title {
          font-family: 'Inter', monospace;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #fff;
        }
        .pts-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .pts-row:last-child { border-bottom: none; }
        .pts-row.top { background: rgba(146,52,235,0.06); }
        .pts-row-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pts-medal {
          font-size: 18px;
          line-height: 1;
          width: 24px;
          text-align: center;
        }
        .pts-place {
          font-size: 14px;
          color: rgba(240,240,240,0.65);
          letter-spacing: 0.02em;
        }
        .pts-pts {
          font-family: 'Inter', monospace;
          font-size: 16px;
          font-weight: 700;
          color: #c084fc;
        }
        .pts-pts.zero { color: rgba(240,240,240,0.2); font-size: 14px; }

        .pts-two-col {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 520px) {
          .pts-two-col { grid-template-columns: 1fr; }
        }
        .pts-list-card {
          background: #121212;
          border: 1px solid rgba(146,52,235,0.2);
          border-radius: 8px;
          padding: 22px 20px;
          position: relative;
          overflow: hidden;
        }
        .pts-list-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #9234eb, transparent);
        }
        .pts-list-card-title {
          font-family: 'Inter', monospace;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #9234eb;
          margin: 0 0 16px;
          text-transform: uppercase;
        }
        .pts-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .pts-list li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 14px;
          color: rgba(240,240,240,0.65);
          line-height: 1.45;
        }
        .pts-list li span.dot {
          color: #9234eb;
          flex-shrink: 0;
          font-size: 13px;
          margin-top: 1px;
        }
      `}</style>

      {/* Hero */}
      <div className="pts-hero">
        <div className="pts-eyebrow">Scoring System</div>
        <h1 className="pts-title">How Points Work</h1>
        <p className="pts-subtitle">Every race counts toward your global rank.</p>
        <div className="pts-divider" />
      </div>

      {/* Tip box */}
      <div className="pts-hint">
        <div className="pts-hint-box">
          On-demand races are open now. Choose your ball, watch the race, and results appear automatically when the race finishes. New races available every day. Live events, when a broadcast is on, use their own points table.
        </div>
      </div>

      {/* Points Tables */}
      <div className="pts-section-label">Points Breakdown</div>
      <div className="pts-tables">
        {/* On-Demand */}
        <div className="pts-table-card">
          <div className="pts-table-head demand">
            <div className="pts-table-dot demand" />
            <div className="pts-table-title">On-Demand</div>
          </div>
          {[
            { medal: '🥇', place: '1st place', pts: '10' },
            { medal: '🥈', place: '2nd place', pts: '5' },
            { medal: '🥉', place: '3rd place', pts: '3' },
            { medal: '🎯', place: '4th – 10th', pts: '1' },
            { medal: '⚪', place: '11th+', pts: '0', zero: true },
          ].map(row => (
            <div key={row.place} className={`pts-row${row.pts !== '0' && row.pts !== '1' ? ' top' : ''}`}>
              <div className="pts-row-left">
                <span className="pts-medal">{row.medal}</span>
                <span className="pts-place">{row.place}</span>
              </div>
              <span className={`pts-pts${row.zero ? ' zero' : ''}`}>{row.zero ? '—' : `${row.pts} pts`}</span>
            </div>
          ))}
        </div>

        {/* Live */}
        <div className="pts-table-card">
          <div className="pts-table-head live">
            <div className="pts-table-dot live" />
            <div className="pts-table-title">Live Events</div>
          </div>
          {[
            { medal: '🥇', place: '1st place', pts: '20' },
            { medal: '🥈', place: '2nd place', pts: '10' },
            { medal: '🥉', place: '3rd place', pts: '5' },
            { medal: '🎯', place: '4th – 10th', pts: '1' },
            { medal: '⚪', place: '11th+', pts: '0', zero: true },
          ].map(row => (
            <div key={row.place} className={`pts-row${row.pts !== '0' && row.pts !== '1' ? ' top' : ''}`}>
              <div className="pts-row-left">
                <span className="pts-medal">{row.medal}</span>
                <span className="pts-place">{row.place}</span>
              </div>
              <span className={`pts-pts${row.zero ? ' zero' : ''}`}>{row.zero ? '—' : `${row.pts} pts`}</span>
            </div>
          ))}
        </div>
      </div>

      {/* What Points Count Towards + What You Can Win */}
      <div className="pts-section-label">What Points Unlock</div>
      <div className="pts-two-col">
        <div className="pts-list-card">
          <div className="pts-list-card-title">Points Count Towards</div>
          <ul className="pts-list">
            {[
              'Global leaderboard rank',
              'Daily standings',
              'Weekly championships',
              'Sponsor prize eligibility',
              'Streak progression',
              'Founder season badges',
              'Season finals qualification',
            ].map(item => (
              <li key={item}><span className="dot">▸</span>{item}</li>
            ))}
          </ul>
        </div>
        <div className="pts-list-card">
          <div className="pts-list-card-title">What You Can Win</div>
          <ul className="pts-list">
            {[
              'Sponsor gift cards',
              'Merch',
              'Branded products',
              'Brand giveaways',
              'TikTok Shop prizes',
              'Championship titles',
              'Permanent founder badges',
            ].map(item => (
              <li key={item}><span className="dot">▸</span>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}