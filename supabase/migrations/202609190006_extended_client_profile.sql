BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS extended_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.users ADD CONSTRAINT users_extended_profile_object CHECK (jsonb_typeof(extended_profile) = 'object');

-- Explicit ownership checks apply even though these functions need access to child rows.
CREATE OR REPLACE FUNCTION public.get_client_profile_details(p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client public.users;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  SELECT * INTO v_client FROM public.users WHERE role_id = 1
    AND (id = p_id OR (p_id IS NULL AND auth_user_id = auth.uid()))
    AND (auth_user_id = auth.uid() OR (advisor_id = auth.uid() AND auth.jwt()->'app_metadata'->>'role' = 'advisor'));
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_client) || jsonb_build_object('client_dependants',
    (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb) FROM public.client_dependants d WHERE d.client_id = v_client.id));
END;
$$;
CREATE OR REPLACE FUNCTION public.save_client_profile_details(p_id uuid, p_columns jsonb, p_extra jsonb, p_dependants jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client public.users; v_profile public.users; v_row jsonb; v_value jsonb; v_group text; v_total numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  SELECT * INTO v_client FROM public.users WHERE id = p_id AND role_id = 1
    AND (auth_user_id = auth.uid() OR (advisor_id = auth.uid() AND auth.jwt()->'app_metadata'->>'role' = 'advisor')) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found or access denied'; END IF;
  IF jsonb_typeof(p_columns) IS DISTINCT FROM 'object' OR jsonb_typeof(p_extra) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_dependants) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid profile format'; END IF;
  IF octet_length(p_extra::text) > 100000 OR jsonb_array_length(p_dependants) > 100 THEN RAISE EXCEPTION 'Profile exceeds the supported size'; END IF;
  FOR v_value IN SELECT value FROM jsonb_each(p_columns) LOOP
    IF jsonb_typeof(v_value) NOT IN ('string', 'number', 'null') THEN RAISE EXCEPTION 'Invalid profile field'; END IF;
  END LOOP;
  v_profile := jsonb_populate_record(NULL::public.users, p_columns);
  IF nullif(trim(v_profile.first_name), '') IS NULL OR nullif(trim(v_profile.surname), '') IS NULL THEN RAISE EXCEPTION 'First name and surname are required'; END IF;
  IF v_profile.annual_income < 0 OR v_profile.date_of_birth > current_date THEN RAISE EXCEPTION 'Check income and date of birth'; END IF;
  IF v_client.auth_user_id IS NOT NULL AND v_profile.id_number IS DISTINCT FROM v_client.id_number THEN RAISE EXCEPTION 'Contact your adviser to change the ID used for sign-in'; END IF;
  v_value := p_extra #> '{personal,title}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Title'; END IF;
  v_value := p_extra #> '{personal,maidenName}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Maiden name'; END IF;
  v_value := p_extra #> '{personal,marriageContract}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Marriage contract'; END IF;
  v_value := p_extra #> '{personal,marriageDate}';
  PERFORM (p_extra #>> '{personal,marriageDate}')::date;
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Marriage date'; END IF;
  v_value := p_extra #> '{personal,highestEducation}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Highest education'; END IF;
  v_value := p_extra #> '{personal,smokerStatus}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Smoker status'; END IF;
  v_value := p_extra #> '{personal,executorOfWill}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Executor of will'; END IF;
  v_value := p_extra #> '{personal,hobbies}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Hobbies'; END IF;
  v_value := p_extra #> '{personal,yearsAtJob}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Years at current job'; END IF;
  IF (p_extra #>> '{personal,yearsAtJob}')::numeric < 0 THEN RAISE EXCEPTION 'Years at current job cannot be negative'; END IF;
  v_value := p_extra #> '{personal,workAllocation,admin}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Admin'; END IF;
  IF (p_extra #>> '{personal,workAllocation,admin}')::numeric < 0 THEN RAISE EXCEPTION 'Admin cannot be negative'; END IF;
  v_value := p_extra #> '{personal,workAllocation,supervisor}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Supervisor'; END IF;
  IF (p_extra #>> '{personal,workAllocation,supervisor}')::numeric < 0 THEN RAISE EXCEPTION 'Supervisor cannot be negative'; END IF;
  v_value := p_extra #> '{personal,workAllocation,travelling}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Travelling'; END IF;
  IF (p_extra #>> '{personal,workAllocation,travelling}')::numeric < 0 THEN RAISE EXCEPTION 'Travelling cannot be negative'; END IF;
  v_value := p_extra #> '{personal,workAllocation,manual}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Manual'; END IF;
  IF (p_extra #>> '{personal,workAllocation,manual}')::numeric < 0 THEN RAISE EXCEPTION 'Manual cannot be negative'; END IF;
  v_value := p_extra #> '{personal,rewardsPrograms,gymGroup}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Gym group'; END IF;
  v_value := p_extra #> '{personal,rewardsPrograms,movieGroup}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Movie group'; END IF;
  v_value := p_extra #> '{personal,rewardsPrograms,airlineGroup}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Airline group'; END IF;
  v_value := p_extra #> '{personal,rewardsPrograms,groceryShop}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Grocery shop'; END IF;
  v_value := p_extra #> '{spouseOrParent,title}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Title'; END IF;
  v_value := p_extra #> '{spouseOrParent,firstName}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid First name'; END IF;
  v_value := p_extra #> '{spouseOrParent,secondName}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Second name'; END IF;
  v_value := p_extra #> '{spouseOrParent,surname}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Surname'; END IF;
  v_value := p_extra #> '{spouseOrParent,maidenName}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Maiden name'; END IF;
  v_value := p_extra #> '{spouseOrParent,nationalityResidence}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Nationality / residence'; END IF;
  v_value := p_extra #> '{spouseOrParent,idNumber}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid ID number'; END IF;
  v_value := p_extra #> '{spouseOrParent,highestEducation}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Highest education'; END IF;
  v_value := p_extra #> '{spouseOrParent,occupation}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Occupation'; END IF;
  v_value := p_extra #> '{spouseOrParent,annualIncome}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Annual income (ZAR)'; END IF;
  IF (p_extra #>> '{spouseOrParent,annualIncome}')::numeric < 0 THEN RAISE EXCEPTION 'Annual income (ZAR) cannot be negative'; END IF;
  v_value := p_extra #> '{spouseOrParent,smokerStatus}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Smoker status'; END IF;
  v_value := p_extra #> '{spouseOrParent,mobileNumber}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Mobile number'; END IF;
  v_value := p_extra #> '{spouseOrParent,marriageDate}';
  PERFORM (p_extra #>> '{spouseOrParent,marriageDate}')::date;
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Marriage date'; END IF;
  v_value := p_extra #> '{spouseOrParent,workAllocation,admin}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Admin'; END IF;
  IF (p_extra #>> '{spouseOrParent,workAllocation,admin}')::numeric < 0 THEN RAISE EXCEPTION 'Admin cannot be negative'; END IF;
  v_value := p_extra #> '{spouseOrParent,workAllocation,supervisor}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Supervisor'; END IF;
  IF (p_extra #>> '{spouseOrParent,workAllocation,supervisor}')::numeric < 0 THEN RAISE EXCEPTION 'Supervisor cannot be negative'; END IF;
  v_value := p_extra #> '{spouseOrParent,workAllocation,travelling}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Travelling'; END IF;
  IF (p_extra #>> '{spouseOrParent,workAllocation,travelling}')::numeric < 0 THEN RAISE EXCEPTION 'Travelling cannot be negative'; END IF;
  v_value := p_extra #> '{spouseOrParent,workAllocation,manual}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Manual'; END IF;
  IF (p_extra #>> '{spouseOrParent,workAllocation,manual}')::numeric < 0 THEN RAISE EXCEPTION 'Manual cannot be negative'; END IF;
  v_value := p_extra #> '{spouseOrParent,rewardsPrograms,gymGroup}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Gym group'; END IF;
  v_value := p_extra #> '{spouseOrParent,rewardsPrograms,movieGroup}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Movie group'; END IF;
  v_value := p_extra #> '{spouseOrParent,rewardsPrograms,airlineGroup}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Airline group'; END IF;
  v_value := p_extra #> '{spouseOrParent,rewardsPrograms,groceryShop}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Grocery shop'; END IF;
  v_value := p_extra #> '{personal,referral,referredBy}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Referred by'; END IF;
  v_value := p_extra #> '{personal,referral,mobile}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Mobile'; END IF;
  v_value := p_extra #> '{personal,referral,idNumber}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid ID number'; END IF;
  v_value := p_extra #> '{employment,employeeNumber}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Employee number'; END IF;
  v_value := p_extra #> '{employment,employmentType}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Employment type'; END IF;
  v_value := p_extra #> '{employment,employmentDate}';
  PERFORM (p_extra #>> '{employment,employmentDate}')::date;
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Employment date'; END IF;
  v_value := p_extra #> '{employment,incomeTaxNumber}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Income tax number'; END IF;
  v_value := p_extra #> '{employment,hrBenefitsContact,name}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Name'; END IF;
  v_value := p_extra #> '{employment,hrBenefitsContact,number}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Number'; END IF;
  v_value := p_extra #> '{employment,hrBenefitsContact,email}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Email'; END IF;
  v_value := p_extra #> '{doctor,nameSurname}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Name and surname'; END IF;
  v_value := p_extra #> '{doctor,practice}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Practice'; END IF;
  v_value := p_extra #> '{doctor,address}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Address'; END IF;
  v_value := p_extra #> '{doctor,contacts}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Contact details'; END IF;
  v_value := p_extra #> '{banking,salary,branchCode}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Branch code'; END IF;
  v_value := p_extra #> '{banking,alternate,bank}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Bank'; END IF;
  v_value := p_extra #> '{banking,alternate,accountType}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Account type'; END IF;
  v_value := p_extra #> '{banking,alternate,branchCode}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Branch code'; END IF;
  v_value := p_extra #> '{banking,alternate,accountNumber}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Account number'; END IF;
  v_value := p_extra #> '{contact,telephoneHome}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Home telephone'; END IF;
  v_value := p_extra #> '{contact,telephoneWork}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Work telephone'; END IF;
  v_value := p_extra #> '{contact,skypeName}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Skype name'; END IF;
  v_value := p_extra #> '{contact,workEmail}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Work email'; END IF;
  v_value := p_extra #> '{addresses,yearsAtPrimary}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Years at primary address'; END IF;
  IF (p_extra #>> '{addresses,yearsAtPrimary}')::numeric < 0 THEN RAISE EXCEPTION 'Years at primary address cannot be negative'; END IF;
  v_value := p_extra #> '{addresses,postalAddress}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Postal address'; END IF;
  v_value := p_extra #> '{addresses,otherAddress}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Other address'; END IF;
  v_value := p_extra #> '{addresses,yearsAtOther}';
  IF v_value IS NOT NULL AND jsonb_typeof(v_value) NOT IN ('string','number','null') THEN RAISE EXCEPTION 'Invalid Years at other address'; END IF;
  IF (p_extra #>> '{addresses,yearsAtOther}')::numeric < 0 THEN RAISE EXCEPTION 'Years at other address cannot be negative'; END IF;
  FOREACH v_group IN ARRAY ARRAY['personal','spouseOrParent'] LOOP
    SELECT sum(value::numeric) INTO v_total FROM jsonb_each_text(coalesce(p_extra #> ARRAY[v_group,'workAllocation'], '{}'::jsonb));
    IF v_total > 100 THEN RAISE EXCEPTION 'Work allocation cannot exceed 100 percent'; END IF;
  END LOOP;
  FOREACH v_group IN ARRAY ARRAY['immediate','longTerm'] LOOP
    v_value := p_extra #> ARRAY['goals',v_group];
    IF v_value IS NOT NULL THEN
      IF jsonb_typeof(v_value) <> 'array' THEN RAISE EXCEPTION 'Planning goals must be lists'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_value) x WHERE jsonb_typeof(x) <> 'string') THEN RAISE EXCEPTION 'Each planning goal must be text'; END IF;
    END IF;
  END LOOP;
  UPDATE public.users SET
    first_name = v_profile.first_name,
    second_name = v_profile.second_name,
    surname = v_profile.surname,
    nationality = v_profile.nationality,
    date_of_birth = v_profile.date_of_birth,
    id_number = v_profile.id_number,
    marital_status = v_profile.marital_status,
    occupation = v_profile.occupation,
    annual_income = v_profile.annual_income,
    employer_name = v_profile.employer_name,
    bank_name = v_profile.bank_name,
    bank_account_type = v_profile.bank_account_type,
    bank_account_number = v_profile.bank_account_number,
    contact_mobile = v_profile.contact_mobile,
    contact_email = v_profile.contact_email,
    physical_address = v_profile.physical_address,
    extended_profile = p_extra WHERE id = p_id;
  SELECT sum((d->>'beneficiary_percentage')::numeric) INTO v_total FROM jsonb_array_elements(p_dependants) d;
  IF v_total > 100 THEN RAISE EXCEPTION 'Beneficiary allocations cannot exceed 100 percent'; END IF;
  DELETE FROM public.client_dependants d WHERE client_id = p_id AND NOT EXISTS
    (SELECT 1 FROM jsonb_array_elements(p_dependants) item WHERE (item->>'id')::uuid = d.id);
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_dependants) LOOP
    IF nullif(trim(v_row->>'full_name'), '') IS NULL OR (v_row->>'beneficiary_percentage')::numeric < 0 OR (v_row->>'date_of_birth')::date > current_date THEN RAISE EXCEPTION 'Check dependant name, date of birth and allocation'; END IF;
    IF v_row->>'id' IS NULL THEN
      INSERT INTO public.client_dependants(client_id, full_name, relationship, date_of_birth, id_number, beneficiary_percentage)
      VALUES(p_id, trim(v_row->>'full_name'), v_row->>'relationship', (v_row->>'date_of_birth')::date, v_row->>'id_number', (v_row->>'beneficiary_percentage')::numeric);
    ELSE
      UPDATE public.client_dependants SET full_name = trim(v_row->>'full_name'), relationship = v_row->>'relationship',
        date_of_birth = (v_row->>'date_of_birth')::date, id_number = v_row->>'id_number', beneficiary_percentage = (v_row->>'beneficiary_percentage')::numeric
      WHERE id = (v_row->>'id')::uuid AND client_id = p_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid dependant record'; END IF;
    END IF;
  END LOOP;
  RETURN public.get_client_profile_details(p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_profile_details(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_client_profile_details(uuid,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_profile_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_profile_details(uuid,jsonb,jsonb,jsonb) TO authenticated;
COMMIT;
