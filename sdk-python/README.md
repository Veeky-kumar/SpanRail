# spanrail

Python SDK for [Spanrail](https://github.com/Veeky-kumar/spanrail), a self-hosted LLM observability
platform. No dependencies; Python 3.9 or newer.

```
pip install spanrail
```

The import name is `spanrail`; the client class is `Spanrail`, because it talks to a Spanrail server.

## Send a trace

```python
from openai import OpenAI
from spanrail import Spanrail

tw = Spanrail("pk-...", "sk-...", base_url="http://localhost:3000")
client = OpenAI()

trace = tw.trace("support-chat", user_id="u_123", tags=["prod"])

messages = [{"role": "user", "content": "Where is my order?"}]
with trace.generation("answer", model="gpt-4o-mini", input=messages) as gen:
    reply = client.chat.completions.create(model="gpt-4o-mini", messages=messages)
    gen.end(
        output=reply.choices[0].message.content,
        usage={"input": reply.usage.prompt_tokens, "output": reply.usage.completion_tokens},
    )

trace.score("helpful", 1)
```

Create the key pair under a project's settings in the dashboard. Events are queued and sent from a
background thread, and flushed when the program exits. Call `tw.flush()` first if you need them sent now,
for example at the end of a serverless handler.

## Behaviour worth knowing

- **It never raises into your app.** If Spanrail is down, a batch is retried a few times and then
  dropped. `tw.sent` and `tw.dropped` count both. A full queue (`max_queue`, default 10,000) drops new
  events the same way.
- **Unknown is not zero.** Fields you leave out are not sent. Usage and cost appear only if you pass them.
- **Errors are recorded for you.** If code inside `with trace.span(...)` or `with trace.generation(...)`
  raises, the observation is ended with level `ERROR` and the exception as its status message, and the
  exception still propagates.
- Spans and generations nest: `span.generation(...)`, `span.span(...)`. `event(...)` records a point in time.
- `tw.get_prompt("name", label="production")` fetches a versioned prompt.

## Options

`Spanrail(public_key, secret_key, base_url="http://localhost:3000", flush_at=20, flush_interval=2.0,
max_queue=10000, timeout=10.0, retries=3)`

## Licence

MIT.
