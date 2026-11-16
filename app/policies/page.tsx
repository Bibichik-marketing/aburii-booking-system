export default function Policies() {
  return (
    <main id="main" className="policy">
      <span className="eyebrow">A LITTLE CLARITY</span>
      <h1>
        Privacy &<br />
        <em>booking policy.</em>
      </h1>
      <p className="notice">
        Provisional policy · version 2026-11-draft. Restaurant approval is
        required before accepting live bookings.
      </p>
      <h2>Reservation requests</h2>
      <p>
        Your request is pending until confirmed by Aburii. Pending requests hold
        capacity for the period displayed at booking, ending no later than the
        reservation start time. Expiry before the scheduled start releases
        capacity. At or after the scheduled start, the original dining interval
        remains occupied even if the request expires.
      </p>
      <h2>Seating & dining time</h2>
      <p>
        You choose Counter Seating or Private Room. Specific seats and rooms are
        arranged internally. The dining interval and any private-room minimum
        spend are displayed before submission. Special requests are subject to
        availability.
      </p>
      <h2>Changes & cancellations</h2>
      <p>
        Please call +60 10 910 0267 with your booking reference. Cancellation
        before the scheduled start releases capacity immediately, as do
        rejection and expiry before that time. Once the scheduled start is
        reached, capacity remains occupied until the original scheduled end,
        even if staff marks the reservation completed, cancelled or no-show
        early. We do not collect deposits or charge cancellation fees through
        this system.
      </p>
      <h2>Your personal information</h2>
      <p>
        Aburii uses your name, contact information, party details and requests
        to manage your reservation. Authorized staff can access these details.
        Supabase processes reservation data and authentication. If you opt in,
        WhatsApp Business processes your number and reservation updates. Email
        is optional; automated email delivery is not enabled.
      </p>
      <p>
        For access, correction, deletion requests or privacy questions, contact
        aburiittdi@gmail.com. Please avoid including sensitive information in
        special requests. Data retention and any international processing
        disclosures must be approved by the restaurant before launch.
      </p>
      <a className="button" href="/">
        Back to reservations ↗
      </a>
    </main>
  );
}
