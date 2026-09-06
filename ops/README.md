# ops

Deployment health checking for the whole BiodiversityOS stack. It lives in this
repo because the indexer is the stateful component and its `/health` endpoint is
the signal the rest of the checks hang off, but `monitor.sh` covers every
service on the host.

## Why it asserts about data, not ports

The two worst outages so far were both invisible to a port check:

- The indexer looped forever without advancing `lastBlock`, because a throw in
  the middle of a poll aborted it before the cursor was committed. GraphQL kept
  answering normally the entire time.
- The frontend rendered an empty map, because a DNS lookup for the indexer
  failed inside the app container and the error was swallowed into an empty
  array. The page returned HTTP 200 with "0 sightings on record".

So every check here asserts something about the content: the index is not empty,
it is not far behind the chain, the chain's record count matches what is
indexed, and the app actually renders the sightings panel with a non-zero count.

## Install

```bash
sudo cp monitor.service monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bos-monitor.timer
```

Failures go to the journal under the `bos-monitor` tag:

```bash
journalctl -t bos-monitor --since today
```

Set `ALERT_WEBHOOK` in `monitor.service` to have them delivered somewhere you
actually read — the journal alone still requires someone to look.
