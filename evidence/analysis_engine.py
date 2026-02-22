from thefuzz import fuzz

# Minimum fuzzy match score (0–100) to flag a keyword match.
# 85 provides high confidence while allowing for minor spelling variations.
_FUZZY_MATCH_THRESHOLD = 85


class CoerciveControlEngine:
    def __init__(self):
        # Duluth Power and Control Wheel categories
        self.duluth_categories = {
            'Financial control': ['money', 'bank', 'job', 'ruin you financially'],
            'Isolation tactics': ['friends', 'family', 'who are you with'],
            'Threats and intimidation': ['kill', 'destroy', 'take the kids'],
        }

        # DARVO Tactics Analysis (Deny, Attack, Reverse Victim and Offender)
        self.darvo = {
            'Deny': ['never happened', 'imagining things', "didn't do that"],
            'Attack': ['crazy', 'liar', 'unstable', 'bitch'],
            'Reverse': ['you made me', 'your fault', 'i am the victim'],
        }

        # Institutional DARVO / Systemic Abuse indicators
        self.systemic_abuse = [
            'CPS', 'court', 'judge', 'law enforcement', 'police', 'social worker',
        ]

    def analyze_message(self, text):
        results = {
            'categories': [],
            'darvo_flags': [],
            'institutional_abuse': False,
            'severity': 1,  # Severity Scoring (1=Low, 4=Critical)
        }

        text_lower = text.lower()

        # Fuzzy Matching & Synonym Detection for Duluth Categories
        for category, keywords in self.duluth_categories.items():
            for word in keywords:
                if fuzz.partial_ratio(word, text_lower) > _FUZZY_MATCH_THRESHOLD:
                    results['categories'].append(category)
                    results['severity'] = max(results['severity'], 2)

        # DARVO Detection
        for phase, keywords in self.darvo.items():
            if any(word in text_lower for word in keywords):
                results['darvo_flags'].append(phase)

        # Systemic/Institutional Detection
        if any(word in text_lower for word in self.systemic_abuse):
            results['institutional_abuse'] = True
            results['severity'] = 4  # Critical risk level

        return results
