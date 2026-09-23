from pathlib import Path


def test_life_expectancy_is_merged_into_calculator_states():
    source = Path('backend/api/preferences.py').read_text()
    assert "calculator_state_keys = ['showMeTheMoney', 'pia', 'divorced', 'widow', 'lifeExpectancy']" in source
