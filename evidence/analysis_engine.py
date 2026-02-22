from thefuzz import fuzz

# Minimum fuzzy match score (0–100) to flag a keyword match.
# 85 provides high confidence while allowing for minor spelling variations.
_FUZZY_MATCH_THRESHOLD = 85


class CoerciveControlEngine:
    def __init__(self):
        # ---------------------------------------------------------------
        # POST-SEPARATION POWER AND CONTROL WHEEL (Duluth model)
        # Tactics commonly used after a relationship has ended to maintain
        # power over a survivor.
        # ---------------------------------------------------------------
        self.duluth_categories = {
            'Coercion and Threats': [
                'take the kids', 'take custody', 'take the children', 'call CPS',
                'report you to CPS', 'report you', 'expose you', 'ruin you',
                'take everything', 'hurt myself', 'kill myself', 'threaten',
                'stop support', 'make you pay', 'you will regret', 'going to get you',
                'come after you', 'destroy your life', 'no way out',
            ],
            'Intimidation': [
                'showing up', 'showed up at my', 'outside my house', 'drove by',
                'following me', 'tracking me', 'spying on me', 'watching me',
                'smashed', 'broke my', 'destroyed my', 'threw', 'punched the wall',
                'displayed a weapon', 'gun', 'knife', 'weapons', 'look what I can do',
            ],
            'Emotional Abuse': [
                'no one will believe you', 'you are worthless', "you're worthless",
                'you are pathetic', "you're pathetic", 'you are nothing', "you're nothing",
                'bad mother', 'bad father', 'bad parent', 'you failed', 'loser',
                'you will never find', 'no one wants you', 'you are lucky I',
                'you deserved it', 'you asked for it', 'humiliate you', 'embarrass you',
                'make you look', 'everyone knows', 'laughing at you',
            ],
            'Isolation': [
                'stay away from your', 'keep you away from', 'told everyone about you',
                'spreading rumors', 'turned people against you', 'ruined your reputation',
                'no one will help you', 'cut off', 'isolated', 'alone',
                'keep you from your friends', 'keep you from your family',
                'drive away everyone', 'alienate you',
            ],
            'Minimizing, Denying and Blaming': [
                'never happened', 'imagining things', "didn't do that", 'making it up',
                'exaggerating', 'too sensitive', 'not that bad', 'it was nothing',
                'overreacting', 'you pushed me', 'you made me', 'your fault',
                'brought it on yourself', 'look what you made me do',
                'you provoked me', 'you started it', 'you caused this',
            ],
            'Using Male Privilege': [
                'I decide', 'my decision', 'you have no say', 'I own everything',
                'man of the house', 'head of the household', "it's my house",
                'you do what I say', 'you answer to me', 'I am in charge',
                'my rules', 'obey me', 'you belong to me', 'you are mine',
            ],
            'Legal System Abuse': [
                'file a motion', 'take you to court', 'see you in court',
                'get a lawyer after you', 'restraining order against you',
                'file charges against you', 'report you to the court',
                'sue you', 'harassment charges', 'false report', 'call the police on you',
                'file another motion', 'bury you in paperwork', 'bleed you dry in court',
                'make you spend all your money on lawyers', 'contempt of court',
            ],
            'Stalking and Harassment': [
                'at your work', 'at your job', 'showed up at your workplace',
                'following you', 'monitors your', 'tracking your phone',
                'checking up on you', 'watching your house', 'parked outside',
                'reading your messages', 'hacked your', 'cloned your phone',
                'non-stop messages', 'hundreds of texts', 'calling repeatedly',
                'showing up everywhere', 'know where you are', 'know your schedule',
            ],
            'Using Children as Pawns': [
                'use the kids against you', 'turn the kids against you',
                'told the kids you', 'kids know what you did', 'kids hate you',
                'take the kids away', 'you will never see the kids',
                'custody battle', 'make you fight for the kids',
                'get full custody', 'unfit mother', 'unfit father', 'unfit parent',
                'parental alienation',
            ],
        }

        # ---------------------------------------------------------------
        # POST-SEPARATION ECONOMIC ABUSE WHEEL
        # Financial tactics used after separation to maintain control or
        # cause hardship.
        # ---------------------------------------------------------------
        self.post_separation_economic_abuse = {
            'Sabotaging Employment': [
                'called your work', 'called your boss', 'at your job',
                'showed up at work', 'got you fired', 'told your employer',
                'mess up your job', 'interfere with your work', 'called your coworkers',
                'embarrassed you at work', 'make you lose your job',
            ],
            'Preventing Employment': [
                'refuse to watch the kids', "won't watch the kids",
                "won't babysit", 'take the car', "won't let you work",
                'hiding the car keys', 'you cannot work', 'quit your job',
                'keep you from working', 'prevent you from getting a job',
            ],
            'Withholding Financial Support': [
                "won't pay support", 'not paying child support',
                'withhold child support', 'stop paying support',
                'refuse to pay alimony', 'no support payment',
                "won't send money", 'keeping the money', 'hiding money from you',
                'skip the payment', 'missed support payment',
            ],
            'Controlling Assets and Draining Accounts': [
                'drained the account', 'emptied the account', 'cleaned out',
                'took all the money', 'hiding assets', 'hiding our money',
                'transferred the money', 'maxed out the credit card',
                'ran up debt', 'spending everything', 'leaving you with nothing',
            ],
            'Interfering with Housing': [
                "won't pay rent", "won't pay the mortgage", 'evict you',
                'turned off the utilities', 'cut off the electricity',
                'shut off the water', 'not maintaining the property',
                'let the house fall apart', 'refuse to pay the bills',
            ],
            'Ruining Credit': [
                'ruined your credit', 'destroyed your credit score',
                'opened accounts in your name', 'in your name without permission',
                'identity theft', 'not paying the bills in your name',
                'deliberately missing payments', 'tank your credit',
            ],
            'Using Child Support as Control': [
                'hold support over you', 'pay support only if',
                'stop paying if you', 'conditions on support',
                'unless you agree', 'support in exchange for',
                'use money to control', 'financial leverage',
                'bribe with support', 'pay if you let me',
            ],
        }

        # ---------------------------------------------------------------
        # CHILD ABUSE WHEEL
        # Tactics that directly involve or harm children.
        # ---------------------------------------------------------------
        self.child_abuse_wheel = {
            'Using Children as Messengers': [
                'tell your mother', 'tell your father', 'tell mom',
                'tell dad', 'ask the kids to pass along', 'kids told me you',
                'send a message through the kids', 'use the kids to tell',
                'kids said that you', 'kids know about your',
            ],
            'Visitation Manipulation': [
                'not returning the kids', 'keeping the kids', "won't drop off",
                'not going to drop off', 'not dropping off', 'not bringing the kids',
                'missed visitation', 'denied visitation', 'refused to hand over',
                'showed up late for exchange', 'moving pick-up time',
                'cancelled pickup', 'violating custody order',
                "won't follow the parenting plan", 'interfering with visitation',
            ],
            'Undermining Parenting': [
                'told the kids you are a bad parent', 'kids know what you did',
                'told the kids you do not love them', 'criticize your parenting',
                'undermine your parenting', 'turned the kids against you',
                'kids think you are bad', 'told the kids you abandoned them',
                'report you to CPS for parenting', 'calling you unfit',
            ],
            'Withholding Visitation': [
                "won't let me see the kids", "won't let me see my children",
                'keeping the kids from me', 'canceled my visitation',
                'no access to the kids', 'blocking me from the kids',
                'took the kids away', 'hiding the kids', 'moved the kids',
                'denied me time with the kids', 'cannot see the kids',
                "can't see the kids", 'you cannot see them', "you can't see them",
            ],
            'Using Children to Gather Information': [
                'what did mom say', 'what did dad do', 'what does mom do',
                'what does dad do', 'asked the kids about your',
                'pumping the kids for information', 'using the kids to spy',
                'kids told me where you', 'find out through the kids',
                'interrogating the kids about you',
            ],
            'Threatening Child Custody': [
                'take custody away', 'get full custody', 'file for custody',
                'you will lose the kids', 'take the kids to another state',
                'take the kids out of the country', 'report you to CPS',
                'say you are an unfit parent', 'custody dispute as punishment',
                'threaten custody battle',
            ],
            'Direct Harm or Neglect of Children': [
                'hurt the kids', 'threatened the kids', 'hit the kids',
                'left the kids alone', 'did not feed the kids',
                'neglected the kids', 'exposed the kids to',
                'kids witnessed', 'kids saw the abuse', 'harmed the children',
                'grabbed the kids', 'shook the baby', 'yelled at the kids',
            ],
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

    def _match_wheel(self, wheel, text_lower):
        """
        Returns a list of category names from *wheel* that match *text_lower*.
        Uses fuzzy partial matching for each keyword.
        """
        matched = []
        for category, keywords in wheel.items():
            for word in keywords:
                if fuzz.partial_ratio(word, text_lower) > _FUZZY_MATCH_THRESHOLD:
                    matched.append(category)
                    break  # one match per category is sufficient
        return matched

    def analyze_message(self, text):
        results = {
            # Post-separation power and control wheel matches
            'categories': [],
            # Post-separation economic abuse wheel matches
            'economic_abuse_flags': [],
            # Child abuse wheel matches
            'child_abuse_flags': [],
            'darvo_flags': [],
            'institutional_abuse': False,
            'severity': 1,  # Severity Scoring (1=Low, 4=Critical)
        }

        text_lower = text.lower()

        # Post-Separation Power & Control Wheel
        matched_duluth = self._match_wheel(self.duluth_categories, text_lower)
        if matched_duluth:
            results['categories'] = matched_duluth
            results['severity'] = max(results['severity'], 2)

        # Post-Separation Economic Abuse Wheel
        matched_economic = self._match_wheel(self.post_separation_economic_abuse, text_lower)
        if matched_economic:
            results['economic_abuse_flags'] = matched_economic
            results['severity'] = max(results['severity'], 3)

        # Child Abuse Wheel
        matched_child = self._match_wheel(self.child_abuse_wheel, text_lower)
        if matched_child:
            results['child_abuse_flags'] = matched_child
            results['severity'] = max(results['severity'], 3)

        # DARVO Detection
        for phase, keywords in self.darvo.items():
            if any(word in text_lower for word in keywords):
                results['darvo_flags'].append(phase)

        # Systemic/Institutional Detection
        if any(word in text_lower for word in self.systemic_abuse):
            results['institutional_abuse'] = True
            results['severity'] = max(results['severity'], 4)  # Critical risk level

        return results
