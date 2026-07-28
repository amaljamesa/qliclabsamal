from rest_framework import serializers

from .models import Party


class PartySerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    tallyExportName = serializers.CharField(source='tally_export_name', allow_blank=True, required=False)
    shortName = serializers.CharField(source='short_name', allow_blank=True, required=False)
    partyType = serializers.CharField(source='party_type', allow_blank=True, required=False)
    cellphone = serializers.CharField(allow_blank=True, required=False)
    landLine = serializers.CharField(source='land_line', allow_blank=True, required=False)
    appearUnder = serializers.CharField(source='appear_under', allow_blank=True, required=False)
    inwardTax = serializers.CharField(source='inward_tax', allow_blank=True, required=False)
    enablePortal = serializers.BooleanField(source='enable_portal', required=False)

    gstSupplyType = serializers.CharField(source='gst_supply_type', allow_blank=True, required=False)

    createLedger = serializers.BooleanField(source='create_ledger', required=False)
    openingBalance = serializers.FloatField(source='opening_balance', required=False)
    balanceType = serializers.CharField(source='balance_type', allow_blank=True, required=False)
    dueInDaysType = serializers.CharField(source='due_in_days_type', allow_blank=True, required=False)

    regionName = serializers.CharField(source='region_name', allow_blank=True, required=False)
    areaName = serializers.CharField(source='area_name', allow_blank=True, required=False)

    fromDate = serializers.CharField(source='from_date', allow_blank=True, required=False)
    toDate = serializers.CharField(source='to_date', allow_blank=True, required=False)

    servicedBy = serializers.CharField(source='serviced_by', allow_blank=True, required=False)
    smartTags = serializers.CharField(source='smart_tags', allow_blank=True, required=False)

    class Meta:
        model = Party
        fields = [
            'id', 'createdAt',
            'name', 'tallyExportName', 'shortName', 'alias', 'address', 'state', 'pincode',
            'partyType', 'email', 'cellphone', 'landLine', 'appearUnder', 'inwardTax', 'branch',
            'enablePortal',
            'pan', 'gstSupplyType', 'gstin',
            'createLedger', 'openingBalance', 'balanceType', 'dueInDaysType',
            'regionName', 'areaName', 'route',
            'fromDate', 'toDate', 'active',
            'transactions', 'servicedBy', 'smartTags',
        ]
