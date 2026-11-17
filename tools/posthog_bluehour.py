#!/usr/bin/env python3
"""Build (or bring up to date) Blue Hour's own PostHog dashboard: who plays (country, language, device), how far into the
case they get, where they stop, and the service levels, for this project's pages only.

    POSTHOG_PERSONAL_API_KEY=phx_... python3 tools/posthog_bluehour.py            # create or update
    POSTHOG_PERSONAL_API_KEY=phx_... python3 tools/posthog_bluehour.py --check    # run each query, change nothing

The PostHog project and its capture key are shared with the project this one was split from (Open Earth 3D, whose
dashboard tools/posthog_dashboard.py builds). So every insight here is limited to Blue Hour's pages (SITE), and is named
"Blue Hour · ...", so that the two dashboards never update each other's insights. The events come from web/telemetry.js
(docs/OBSERVABILITY.md); the story's page is counted as the game from version 6 of it (before, as the globe, with no load
time or play time read from it). Standard library only.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from posthog_dashboard import API, OURS, scorecard, deaths  # noqa: E402

DASHBOARD = 'Blue Hour: players, the case and service levels'
SITE = "(properties.$pathname LIKE '/blue-hour%' OR properties.$host LIKE 'blue-hour%')"
SITE_PROPS = [{'type': 'hogql', 'key': SITE, 'value': None}]
P = 'Blue Hour · '


def w(days):
    return f'timestamp > now() - INTERVAL {days} DAY AND {SITE}'


def sited(q, days):
    """A query of tools/posthog_dashboard.py, limited to this project's pages (each of them has its window in this form)."""
    t = f'timestamp > now() - INTERVAL {days} DAY'
    assert t in q, 'the shared query no longer has its time window in the expected form'
    return q.replace(t, f'{t} AND {SITE}')


def first_view(days, cols):
    # one row a visitor: what their first view of the period said about them
    return (f"SELECT {cols}, count() AS visitors FROM (SELECT distinct_id, argMin(properties, timestamp) AS p FROM events "
            f"WHERE event = 'view' AND {w(days)} GROUP BY distinct_id) GROUP BY ALL ORDER BY visitors DESC LIMIT 40")


def who(days):
    return first_view(days, "coalesce(toString(JSONExtractString(p, '$geoip_country_code')), '?') AS country, "
                            "coalesce(nullIf(JSONExtractString(p, 'lang'), ''), '?') AS language, coalesce(nullIf(JSONExtractString(p, 'tz'), ''), '?') AS time_zone")


def devices(days):
    return first_view(days, "JSONExtractString(p, 'device') AS device, JSONExtractString(p, 'os') AS os, JSONExtractString(p, 'browser') AS browser, "
                            "JSONExtractString(p, 'tier') AS tier, coalesce(nullIf(JSONExtractString(p, 'gpu'), ''), '?') AS gpu")


def engagement(days):
    return ("SELECT a.visitors AS visitors, a.page_loads AS page_loads, b.players AS players, round(b.hours, 1) AS play_hours, "
            "round(b.med / 60, 1) AS play_min_median, round(b.p90 / 60, 1) AS play_min_p90 FROM "
            f"(SELECT 1 AS k, count(DISTINCT distinct_id) AS visitors, count(DISTINCT properties.sid) AS page_loads FROM events WHERE {OURS} AND {w(days)}) AS a "
            "LEFT JOIN (SELECT 1 AS k, count() AS players, sum(t) / 3600 AS hours, quantile(0.5)(t) AS med, quantile(0.9)(t) AS p90 FROM "
            f"(SELECT distinct_id, sum(toFloat(properties.s)) AS t FROM events WHERE event = 'time' AND properties.view = 'game' AND {w(days)} GROUP BY distinct_id)) AS b "
            "ON a.k = b.k")


def funnel(days):
    """The case as a funnel: of the visitors who began it, how many reached each frame and the last card (story events)."""
    reach = ("multiIf(toString(properties.action) = 'end', 8, toInt(properties.frame))")
    return ("SELECT step, count(DISTINCT distinct_id) AS visitors FROM ("
            f"SELECT distinct_id, arrayJoin(range(1, max({reach}) + 1)) AS step FROM events WHERE event = 'story' AND {w(days)} GROUP BY distinct_id) "
            "GROUP BY step ORDER BY step")


def story_moments(days):
    return ("SELECT toString(properties.action) AS what, toInt(properties.frame) AS frame, count() AS times, count(DISTINCT distinct_id) AS visitors "
            f"FROM events WHERE event = 'story' AND toString(properties.action) IN ('seen_through', 'spent', 'end') AND {w(days)} "
            "GROUP BY what, frame ORDER BY what, frame")


def where_stop(days):
    # the last spot of each page load that was in the case: the frame and the beat the player left at
    return ("SELECT where_left, count() AS page_loads, round(median(page_s)) AS median_page_s FROM ("
            "SELECT properties.sid AS sid, argMax(toString(properties.spot), timestamp) AS where_left, max(if(event = 'exit', toFloat(properties.page_s), NULL)) AS page_s, "
            "maxIf(1, toString(properties.mode) = 'story') AS in_case "
            f"FROM events WHERE {OURS} AND event != 'crash' AND {w(days)} GROUP BY sid) WHERE in_case = 1 GROUP BY where_left ORDER BY page_loads DESC LIMIT 40")


def time_in_case(days):
    return ("SELECT toString(properties.spot) AS where, round(sum(toFloat(properties.s)) / 60, 1) AS minutes, count(DISTINCT distinct_id) AS visitors, "
            "round(sum(toFloat(properties.s) * toFloat(properties.fps)) / nullIf(sum(toFloat(properties.s)), 0)) AS fps "
            f"FROM events WHERE event = 'dwell' AND toString(properties.mode) = 'story' AND {w(days)} GROUP BY where ORDER BY minutes DESC LIMIT 60")


def loads(days):
    q = lambda f: f"round(quantile(0.75)(toFloat(properties.{f})) / 1000, 1)"
    return (f"SELECT properties.device AS device, count() AS loads, countIf(toString(properties.ok) != 'true') AS failed_or_left, {q('fetch_ms')} AS fetched_s, "
            f"{q('build_ms')} AS built_s, {q('frame_ms')} AS first_frame_s, {q('ms')} AS ready_p75_s, round(quantile(0.5)(toFloat(properties.kb)) / 1024, 1) AS mb_median "
            f"FROM events WHERE event = 'load' AND properties.view = 'game' AND {w(days)} GROUP BY device ORDER BY loads DESC")


def frame_rate(days):
    return ("SELECT properties.device AS device, coalesce(toString(properties.gpu), '?') AS gpu, properties.tier AS tier, round(sum(toFloat(properties.s)) / 60, 1) AS minutes, "
            "round(quantile(0.5)(toFloat(properties.fps))) AS fps, round(quantile(0.5)(toFloat(properties.f95))) AS p95_frame_ms, "
            "round(100 * sum(toFloat(properties.slow) * toFloat(properties.frames)) / nullIf(sum(toFloat(properties.frames)), 0), 1) AS slow_pct, "
            "argMax(toString(properties.bound), toFloat(properties.s)) AS held_by "
            f"FROM events WHERE event = 'time' AND properties.view = 'game' AND toFloat(properties.frames) >= 10 AND {w(days)} GROUP BY ALL ORDER BY minutes DESC LIMIT 40")


def sql(q):
    return {'kind': 'DataTableNode', 'source': {'kind': 'HogQLQuery', 'query': q}}


def trends(event, math, display, breakdown=None, date_from='-30d'):
    src = {'kind': 'TrendsQuery', 'series': [{'kind': 'EventsNode', 'event': event, 'name': 'Visitors', 'math': math}], 'interval': 'day',
           'dateRange': {'date_from': date_from}, 'properties': SITE_PROPS, 'filterTestAccounts': False, 'trendsFilter': {'display': display}}
    if breakdown:
        src['breakdownFilter'] = {'breakdown': breakdown, 'breakdown_type': 'event', 'breakdown_limit': 25}
    return {'kind': 'InsightVizNode', 'source': src}


INSIGHTS = [
    (P + 'Players, last 30 days', 'Visitors, page loads, players (time in the game), play hours and minutes per player.', sql(engagement(30))),
    (P + 'Visitors per day', 'Distinct visitors (a random id in localStorage) who opened the page.', trends('view', 'dau', 'ActionsLineGraph')),
    (P + 'Countries', 'Visitors by country, as PostHog reads it from the request (the page sends none).', trends('$pageview', 'dau', 'WorldMap', '$geoip_country_code')),
    (P + 'Country, language and time zone, last 30 days', 'One row a visitor: the language the browser asks for and its time zone (from telemetry version 6).', sql(who(30))),
    (P + 'Devices, systems and GPUs, last 30 days', 'One row a visitor: phone, tablet or desktop; system and browser; the quality tier the page chose; the GPU as the browser names it.', sql(devices(30))),
    (P + 'How far into the case, last 30 days', 'Of the visitors who began the case, how many reached each frame (1 to 7) and the last card (8).', sql(funnel(30))),
    (P + 'Seen through, frames spent, cases finished', 'When the one asked saw through the player, frames taken from the wrong place, and last cards, by frame.', sql(story_moments(30))),
    (P + 'Where in the case players leave', 'The frame and beat each page load in the case ended at, with how long the page had been open.', sql(where_stop(30))),
    (P + 'Time spent in each beat', 'Minutes in each frame and beat of the case, and the frame rate there.', sql(time_in_case(30))),
    (P + 'Service levels, last 7 days', 'The nine service levels of docs/OBSERVABILITY.md for this project\'s pages: value, samples, met or missed.', sql(sited(scorecard(7), 7))),
    (P + 'Load time by device, last 30 days', 'p75 of each stage of the load (s from the page\'s start) and the download.', sql(loads(30))),
    (P + 'Frame rate by device and GPU, last 30 days', 'Median frame rate, the 95th percentile frame, the share of frames over 50 ms, and what held it (GPU or script).', sql(frame_rate(30))),
    (P + 'Pages that died, lost contexts and GPU errors, last 30 days', 'By device, system, GPU and the step of the load they reached.', sql(sited(deaths(30), 30))),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true', help='run each query and print its first rows; change nothing')
    a = ap.parse_args()
    key = os.environ.get('POSTHOG_PERSONAL_API_KEY')
    if not key:
        sys.exit('POSTHOG_PERSONAL_API_KEY is not set')
    api = API(key)
    pid = os.environ.get('POSTHOG_PROJECT') or api.call('GET', '/api/projects/@current/')['id']
    for name, desc, q in INSIGHTS:
        r = api.call('POST', f'/api/projects/{pid}/query/', {'query': q['source'] if q['kind'] in ('DataTableNode', 'InsightVizNode') else q})
        rows = r.get('results') or []
        print(f'ok   {name}: {len(rows)} rows' + (f'  e.g. {str(rows[0])[:110]}' if rows else ''))
    if a.check:
        return
    dash = next((d for d in api.all(f'/api/projects/{pid}/dashboards/?limit=200') if d.get('name') == DASHBOARD and not d.get('deleted')), None)
    if not dash:
        dash = api.call('POST', f'/api/projects/{pid}/dashboards/', {'name': DASHBOARD, 'description': 'Blue Hour (the story at the Shibuya Scramble) only: who plays, how far into the case they get, where they stop, and the service levels. Built by tools/posthog_bluehour.py.'})
    have = {i['name']: i for i in api.all(f'/api/projects/{pid}/insights/?limit=200&saved=true') if i.get('name') and not i.get('deleted')}
    for name, desc, q in INSIGHTS:
        body = {'name': name, 'description': desc, 'query': q, 'saved': True}
        if name in have:
            on = set(have[name].get('dashboards') or []) | {dash['id']}
            api.call('PATCH', f"/api/projects/{pid}/insights/{have[name]['id']}/", dict(body, dashboards=sorted(on)))
        else:
            api.call('POST', f'/api/projects/{pid}/insights/', dict(body, dashboards=[dash['id']]))
    host = os.environ.get('POSTHOG_HOST', 'https://eu.posthog.com')
    print(f"{host}/project/{pid}/dashboard/{dash['id']}")


if __name__ == '__main__':
    main()
