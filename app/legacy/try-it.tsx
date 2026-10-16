'use client';

import Image from 'next/image';
import { useState } from 'react';

const PRESETS = ['Enquiries arriving out of hours', 'Slow quoting', 'Reporting across three sites'];

function tidy(text: string): string {
  return text.trim().replace(/[.!?,;:\s]+$/, '');
}

/**
 * "See what they would see": a format preview of the prospect's page, with
 * fictional details, rewritten as the visitor types. Nothing is sent anywhere.
 */
export function TryIt() {
  const [name, setName] = useState('James');
  const [topic, setTopic] = useState('enquiries arriving out of hours');

  const who = name.trim() || 'there';
  let raised = tidy(topic) || 'the problem you raised';
  if (/^[A-Z][a-z]/.test(raised)) raised = raised.charAt(0).toLowerCase() + raised.slice(1);
  const short = raised.length > 34 ? `${raised.slice(0, 33).trimEnd()}…` : raised;

  return (
    <div>
      <div className="demo">
        <form className="try" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
          <p className="eyebrow">Try it</p>
          <h2>See what they would see.</h2>
          <div className="fld2">
            <label htmlFor="t-name">Who did you meet?</label>
            <input
              id="t-name"
              maxLength={24}
              value={name}
              placeholder="First name"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="fld2">
            <label htmlFor="t-topic">What did they raise?</label>
            <input
              id="t-topic"
              maxLength={80}
              value={topic}
              placeholder="A problem, in a few words"
              onChange={(event) => setTopic(event.target.value)}
            />
          </div>
          <div className="presets">
            {PRESETS.map((preset) => (
              <button key={preset} type="button" onClick={() => setTopic(preset)}>
                {preset}
              </button>
            ))}
          </div>
          <p className="hint">
            A format preview with fictional details. The real page also draws on facts from their
            own website.
          </p>
        </form>

        <div className="stage">
          <div className="phone" role="group" aria-label="Preview of the page they would see">
            <div className="who">
              <div className="av">AM</div>
              <div>
                <b>Alex Morgan</b>
                <small>Founder · Morgan &amp; Field</small>
              </div>
            </div>
            <p aria-live="polite">
              <b>Good meeting you, {who}.</b>
              <br />
              You mentioned {raised}. Here&rsquo;s how Alex would approach it, and a simple way to
              carry on the conversation.
            </p>
            <div className="ex">
              <small>From their website</small>A fact taken from their own site, quoted as written,
              goes here.
            </div>
            <div className="book">Book 15 minutes on {short}</div>
            <div className="li">Ask a quick question</div>
            <div className="li">Save Alex&rsquo;s contact</div>
            <div className="li">Connect on LinkedIn</div>
          </div>
          <div className="card3d" aria-hidden="true">
            <Image src="/landing/insignar-mark-white.png" alt="" width={58} height={58} />
          </div>
        </div>
      </div>
      <p className="cap2">Concept preview · fictional people</p>
    </div>
  );
}
