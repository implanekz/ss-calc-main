"""
Calculator preferences endpoints for Ret1re Platform
Handles: get and update calculator preferences (auto-save functionality)
"""
from fastapi import APIRouter, Request, HTTPException
from supabase import Client
from config.supabase import get_supabase_client
import traceback

router = APIRouter(prefix="/api/preferences", tags=["preferences"])
supabase: Client = get_supabase_client()

def get_user_id_from_token_sync(request: Request):
    """Extract and validate user ID from authorization token"""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return None
        
        token = auth_header.split(' ')[1]
        user = supabase.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception as e:
        print(f"Token extraction error: {e}")
        return None

# ============================================
# GET /api/preferences
# ============================================
@router.get("")
async def get_preferences(request: Request):
    """
    Get calculator preferences for current user
    """
    try:
        user_id = get_user_id_from_token_sync(request)
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        response = supabase.table('calculator_preferences').select('*').eq('user_id', user_id).single().execute()
        
        # If no preferences yet, return empty defaults
        if not response.data:
            return {
                'preferences': {
                    'inflation_rate': 0.025,
                    'spouse_preferred_claiming_age_years': None,
                    'spouse_preferred_claiming_age_months': None
                }
            }
        
        data = response.data
        
        # Flatten calculator_states to top-level keys for frontend compatibility
        preferences = {
            'inflation_rate': data.get('inflation_rate'),
            'spouse_preferred_claiming_age_years': data.get('spouse_preferred_claiming_age_years'),
            'spouse_preferred_claiming_age_months': data.get('spouse_preferred_claiming_age_months')
        }
        
        # Add calculator states as top-level keys
        calculator_states = data.get('calculator_states') or {}
        if calculator_states:
            preferences.update(calculator_states)
        
        return {
            'preferences': preferences
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get preferences error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# PUT /api/preferences
# ============================================
@router.put("")
async def update_preferences(request: Request):
    """
    Update calculator preferences (auto-save endpoint)
    """
    try:
        user_id = get_user_id_from_token_sync(request)
        if not user_id:
             raise HTTPException(status_code=401, detail="Unauthorized")
        
        data = await request.json()
        
        # Build update object for standard fields
        update_data = {}
        
        # Known preference fields (stored directly in columns)
        known_fields = {
            'inflationRate': 'inflation_rate',
            'spousePreferredClaimingAgeYears': 'spouse_preferred_claiming_age_years',
            'spousePreferredClaimingAgeMonths': 'spouse_preferred_claiming_age_months'
        }
        
        for frontend_key, db_key in known_fields.items():
            if frontend_key in data:
                update_data[db_key] = data[frontend_key]
        
        # Calculator state fields (stored in calculator_states JSONB)
        calculator_state_keys = ['showMeTheMoney', 'pia', 'divorced', 'widow', 'lifeExpectancy']
        calculator_states_update = {}
        
        for key in calculator_state_keys:
            if key in data:
                # If value is None, we're clearing that calculator state
                calculator_states_update[key] = data[key]
        
        # If we have calculator states to update, fetch current states and merge
        if calculator_states_update:
            try:
                # Get current calculator_states
                current_response = supabase.table('calculator_preferences').select('calculator_states').eq('user_id', user_id).single().execute()
                current_states = current_response.data.get('calculator_states') or {} if current_response.data else {}
                
                # Merge new states with current states
                merged_states = {**current_states, **calculator_states_update}
                update_data['calculator_states'] = merged_states
            except Exception as e:
                 # Check for missing column error (PostgREST error 42703)
                if '42703' in str(e) or 'does not exist' in str(e):
                    print("WARNING: 'calculator_states' column missing in DB. Skipping state persistence. Please run migration 002.")
                else:
                    raise e
        
        if not update_data:
             # Even if no updates, maybe create the record if missing?
             # But usually frontend sends data.
             return {'success': True, 'preferences': {}} # Return empty success if nothing to update
        
        # First check if record exists
        check = supabase.table('calculator_preferences').select('id').eq('user_id', user_id).execute()
        
        try:
            if check.data:
                # Update
                response = supabase.table('calculator_preferences').update(update_data).eq('user_id', user_id).execute()
            else:
                # Insert
                update_data['user_id'] = user_id
                response = supabase.table('calculator_preferences').insert(update_data).execute()
        except Exception as e:
            # Check for missing column error on insert/update if we missed it above
            if ('42703' in str(e) or 'does not exist' in str(e)) and 'calculator_states' in update_data:
                print("WARNING: 'calculator_states' column missing. Retrying update without it.")
                del update_data['calculator_states']
                if not update_data: # If that was the only update
                     return {'success': True, 'preferences': {}}

                if check.data:
                    response = supabase.table('calculator_preferences').update(update_data).eq('user_id', user_id).execute()
                else:
                    update_data['user_id'] = user_id
                    response = supabase.table('calculator_preferences').insert(update_data).execute()
            else:
                raise e
            
        if not response.data:
             raise HTTPException(status_code=400, detail="Failed to update preferences")
        
        # Format response to match GET endpoint structure
        updated_prefs = response.data[0]
        preferences = {
            'inflation_rate': updated_prefs.get('inflation_rate'),
            'spouse_preferred_claiming_age_years': updated_prefs.get('spouse_preferred_claiming_age_years'),
            'spouse_preferred_claiming_age_months': updated_prefs.get('spouse_preferred_claiming_age_months')
        }
        
        # Add calculator states as top-level keys
        calculator_states = updated_prefs.get('calculator_states') or {}
        if calculator_states:
            preferences.update(calculator_states)
        
        return {
            'success': True,
            'preferences': preferences
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update preferences error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
