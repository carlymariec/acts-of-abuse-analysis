import plotly.express as px


def generate_timeline(case_events):
    """
    Creates the interactive chronological timeline infographic.
    Only includes events that have been human-verified.
    """
    data = [
        {
            'Time': event.timestamp,
            'Sender': event.sender,
            'Severity': event.severity_score,
            'Context': event.user_context_notes,
        }
        for event in case_events
        if event.is_verified
    ]

    if not data:
        # No verified events to display; return an empty-state HTML fragment
        return "<p>No verified events available to display timeline.</p>"
    # Scatter plot with time on x-axis, severity on y-axis, colour-coded by sender
    fig = px.scatter(
        data,
        x="Time",
        y="Severity",
        color="Sender",
        hover_data=["Context"],
    )
    return fig.to_html()  # Output for HTML report
