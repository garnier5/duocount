import { AppIcon, Icon } from '../../ui/icons';

export function Welcome() {
  return (
    <div className="onb" style={{ padding: 'calc(var(--sat) + 24px) 24px calc(var(--sab) + 24px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36, paddingTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center' }}>
          <div
            role="img"
            aria-label="DuoCount app icon"
            style={{ width: 132, height: 132, borderRadius: 30, overflow: 'hidden', boxShadow: '0 10px 28px rgba(20,48,58,.22), 0 0 0 .5px rgba(0,0,0,.08)' }}
          >
            <AppIcon />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.12, fontWeight: 700, letterSpacing: '-0.02em' }}>Welcome to DuoCount</h1>
            <p style={{ margin: 0, fontSize: 17, color: 'var(--sec)', lineHeight: 1.4 }}>Your household spending, month after month. No account, no sign-up.</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '0 4px' }}>
          <div className="feat">
            <span className="feat-ico">
              <Icon name="phone" />
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>Your data stays on your phone</div>
              <div className="cap" style={{ fontSize: 15, marginTop: 2 }}>
                Everything is stored on this phone, and nowhere else.
              </div>
            </div>
          </div>
          <div className="feat">
            <span className="feat-ico">
              <Icon name="shieldCheck" />
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>No server, no cloud database</div>
              <div className="cap" style={{ fontSize: 15, marginTop: 2 }}>
                Nobody outside your household sees your numbers.
              </div>
            </div>
          </div>
          <div className="feat">
            <span className="feat-ico">
              <Icon name="lock" />
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>Encrypted sharing between members</div>
              <div className="cap" style={{ fontSize: 15, marginTop: 2 }}>
                A file locked with your household password, sent over WhatsApp.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16 }}>
        <a className="btn pri" href="#/setup/household">
          Get started
        </a>
        <p className="cap" style={{ margin: 0, textAlign: 'center' }}>
          About 2 minutes. You can change everything later.
        </p>
        <a className="btn plain" href="#/join">
          A member already set it up? Join the household
        </a>
      </div>
    </div>
  );
}
