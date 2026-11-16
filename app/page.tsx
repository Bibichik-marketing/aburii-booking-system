import Booking from "./booking";
export default function Home() {
  return (
    <main id="main">
      <section className="intro">
        <div className="eyebrow">
          <span /> THE ART OF GATHERING
        </div>
        <p className="japanese" lang="ja">
          炙り · 心を込めて
        </p>
        <h1>
          A seat. A moment.
          <br />
          <em>Something memorable.</em>
        </h1>
        <p className="intro-copy">
          Exceptional Japanese dining, shared at your own pace.
          <br />
          Your next Aburii experience begins here.
        </p>
        <div className="intro-bottom">
          <span>TTDI, KUALA LUMPUR</span>
          <span>RESERVATIONS ↓</span>
        </div>
      </section>
      <section className="booking-layout" aria-label="Make a reservation">
        <aside>
          <span className="eyebrow">YOUR EXPERIENCE</span>
          <h2>
            Make room
            <br />
            for a little
            <br />
            <em>extraordinary.</em>
          </h2>
          <div className="fine-line" />
          <p>
            Take a place at the counter, or make the evening your own in a
            private room.
          </p>
          <div className="aside-note">
            <span>01 — CHOOSE YOUR SETTING</span>
            <span>02 — FIND YOUR MOMENT</span>
            <span>03 — LEAVE THE DETAILS TO US</span>
          </div>
          <p className="small">
            5, Lorong Datuk Sulaiman 7<br />
            Taman Tun Dr Ismail
            <br />
            60000 Kuala Lumpur
          </p>
        </aside>
        <Booking />
      </section>
    </main>
  );
}
