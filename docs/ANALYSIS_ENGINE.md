# Analysis Engine Reference

The heart of Acts of Abuse Analysis is the `CoerciveControlEngine` — a fuzzy-keyword analysis engine built on three Duluth model Power & Control wheels, DARVO detection, and systemic/institutional abuse scoring.

---

## Contents

1. [How the Engine Works](#1-how-the-engine-works)
2. [Severity Scoring](#2-severity-scoring)
3. [Post-Separation Power & Control Wheel](#3-post-separation-power--control-wheel)
4. [Post-Separation Economic Abuse Wheel](#4-post-separation-economic-abuse-wheel)
5. [Child Abuse Wheel](#5-child-abuse-wheel)
6. [DARVO Detection](#6-darvo-detection)
7. [Systemic and Institutional Abuse](#7-systemic-and-institutional-abuse)
8. [Cross-Reference Flags (`all_flags`)](#8-cross-reference-flags-all_flags)
9. [Using the Engine in Code](#9-using-the-engine-in-code)
10. [Educational Background: The Duluth Model](#10-educational-background-the-duluth-model)

---

## 1. How the Engine Works

```
Input message text
       │
       ▼
   lowercase
       │
       ▼
  fuzzy partial-ratio match
  against each keyword list          threshold = 85 / 100
       │
       ▼
  collect matched categories
  from all three wheels + DARVO + systemic
       │
       ▼
  compute severity score (1–4)
       │
       ▼
  return results dict with all_flags cross-reference
```

**Fuzzy matching** uses the `thefuzz` library (`fuzz.partial_ratio`). A score ≥ 85 is required for a match. This tolerates minor spelling variations, typos, and spacing differences while avoiding false positives.

---

## 2. Severity Scoring

| Score | Label | Trigger |
|-------|-------|---------|
| 1 | Low | No wheel matches |
| 2 | Moderate | Any match on the Post-Separation Power & Control wheel |
| 3 | High | Any match on the Economic Abuse or Child Abuse wheels |
| 4 | Critical | Any match involving a systemic/institutional actor (CPS, court, police, etc.) |

Severity uses `max()` — a message matching both a Power & Control category and the Child Abuse wheel receives a score of 3.

---

## 3. Post-Separation Power & Control Wheel

Drawn from the Duluth model's Post-Separation Power and Control wheel. These tactics are used to maintain dominance over a survivor after the relationship has ended.

### Categories

| Category | Example keywords |
|----------|-----------------|
| **Coercion and Threats** | "take the kids", "hurt myself", "you will regret", "destroy your life" |
| **Intimidation** | "showing up", "drove by", "smashed", "displayed a weapon", "gun" |
| **Emotional Abuse** | "no one will believe you", "you are worthless", "bad mother", "you deserved it" |
| **Isolation** | "turned people against you", "cut off", "keep you from your family" |
| **Minimizing, Denying and Blaming** | "never happened", "you're too sensitive", "you made me", "your fault" |
| **Using Male Privilege** | "I decide", "man of the house", "you belong to me", "obey me" |
| **Legal System Abuse** | "file a motion", "bury you in paperwork", "bleed you dry in court" |
| **Stalking and Harassment** | "at your work", "tracking your phone", "parked outside", "non-stop messages" |
| **Using Children as Pawns** | "turn the kids against you", "unfit mother", "parental alienation" |

---

## 4. Post-Separation Economic Abuse Wheel

Financial tactics used after separation to create hardship or maintain leverage.

### Categories

| Category | Example keywords |
|----------|-----------------|
| **Sabotaging Employment** | "called your boss", "got you fired", "embarrassed you at work" |
| **Preventing Employment** | "won't watch the kids", "take the car", "quit your job" |
| **Withholding Financial Support** | "not paying child support", "refusing to pay alimony", "hiding money" |
| **Controlling Assets and Draining Accounts** | "drained the account", "hiding assets", "maxed out the credit card" |
| **Interfering with Housing** | "won't pay rent", "cut off the electricity", "evict you" |
| **Ruining Credit** | "opened accounts in your name", "identity theft", "tank your credit" |
| **Using Child Support as Control** | "conditions on support", "pay if you let me", "financial leverage" |

---

## 5. Child Abuse Wheel

Tactics that directly involve or harm children, or use children as instruments of control.

### Categories

| Category | Example keywords |
|----------|-----------------|
| **Using Children as Messengers** | "tell your mother", "use the kids to tell", "send a message through the kids" |
| **Visitation Manipulation** | "not returning the kids", "cancelled pickup", "violating custody order" |
| **Undermining Parenting** | "told the kids you are a bad parent", "turned the kids against you" |
| **Withholding Visitation** | "won't let me see the kids", "hiding the kids", "denied me time" |
| **Using Children to Gather Information** | "pumping the kids for information", "interrogating the kids about you" |
| **Threatening Child Custody** | "take the kids to another state", "say you are an unfit parent" |
| **Direct Harm or Neglect of Children** | "hurt the kids", "left the kids alone", "kids witnessed the abuse" |

---

## 6. DARVO Detection

DARVO stands for **Deny, Attack, Reverse Victim and Offender** — a pattern identified by Dr Jennifer Freyd in which an abuser, when confronted, denies the behaviour, attacks the person confronting them, and then claims to be the real victim.

| Phase | Example keywords |
|-------|-----------------|
| **Deny** | "never happened", "imagining things", "didn't do that" |
| **Attack** | "crazy", "liar", "unstable" |
| **Reverse** | "you made me", "your fault", "i am the victim" |

---

## 7. Systemic and Institutional Abuse

When an abuser weaponises government systems, courts, or child-protection agencies as tools of coercion, the harm extends beyond the personal relationship. A message is flagged for **Institutional Abuse** when it contains any of:

> `CPS`, `court`, `judge`, `law enforcement`, `police`, `social worker`

This flag triggers a **Critical (4)** severity score because involvement of state actors greatly increases the risk and complexity of the survivor's situation.

---

## 8. Cross-Reference Flags (`all_flags`)

Every match from every wheel is aggregated into a single `all_flags` list. Each entry is a dict:

```python
{'wheel': '<wheel name>', 'category': '<category name>'}
```

Example result for a message containing threats and child-abuse tactics:

```python
{
    'categories': ['Coercion and Threats', 'Using Children as Pawns'],
    'economic_abuse_flags': [],
    'child_abuse_flags': ['Threatening Child Custody'],
    'darvo_flags': ['Deny'],
    'institutional_abuse': False,
    'severity': 3,
    'all_flags': [
        {'wheel': 'Post-Separation Power & Control', 'category': 'Coercion and Threats'},
        {'wheel': 'Post-Separation Power & Control', 'category': 'Using Children as Pawns'},
        {'wheel': 'Child Abuse',                    'category': 'Threatening Child Custody'},
        {'wheel': 'DARVO',                          'category': 'Deny'},
    ]
}
```

---

## 9. Using the Engine in Code

```python
from evidence.analysis_engine import CoerciveControlEngine

engine = CoerciveControlEngine()
result = engine.analyze_message(
    "You will never see the kids again. "
    "I'm filing a motion tomorrow and you caused all of this."
)

print(result['severity'])          # 4  (court mention → Critical)
print(result['categories'])        # ['Coercion and Threats', 'Legal System Abuse', ...]
print(result['institutional_abuse'])  # True
for flag in result['all_flags']:
    print(f"  [{flag['wheel']}] {flag['category']}")
```

---

## 10. Educational Background: The Duluth Model

The Duluth Domestic Abuse Intervention Project developed the **Power and Control Wheel** in 1984 as a framework for understanding coercive control. It has since been adapted into multiple specialised wheels covering post-separation abuse, economic abuse, and child abuse.

Key resources:

- [Domestic Abuse Intervention Programs (theduluthmodel.org)](https://www.theduluthmodel.org/)
- National Domestic Violence Hotline: **1-800-799-SAFE (7233)**
- [DARVO — Dr Jennifer Freyd, University of Oregon](https://dynamic.uoregon.edu/jjf/defineDARVO.html)

> **Important:** The analysis engine is an automated screening tool. It is not a substitute for professional legal advice, victim-advocacy services, or clinical assessment. All matches must be reviewed and verified by a human before being presented as evidence.

---

## See Also

- [How to Use the App](USAGE.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Project Vision](VISION.md)
