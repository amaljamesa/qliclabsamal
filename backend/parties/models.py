import uuid

from django.db import models


def generate_party_id() -> str:
    return f"party-{uuid.uuid4().hex}"


class Party(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=generate_party_id, editable=False)

    name = models.CharField(max_length=255)
    tally_export_name = models.CharField(max_length=255, blank=True)
    short_name = models.CharField(max_length=255, blank=True)
    alias = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=20, blank=True)
    party_type = models.CharField(max_length=100, blank=True)
    email = models.CharField(max_length=255, blank=True)
    cellphone = models.CharField(max_length=20, blank=True)
    land_line = models.CharField(max_length=20, blank=True)
    appear_under = models.CharField(max_length=100, blank=True)
    inward_tax = models.CharField(max_length=100, blank=True)
    branch = models.CharField(max_length=255, blank=True)
    enable_portal = models.BooleanField(default=False)

    pan = models.CharField(max_length=20, blank=True)
    gst_supply_type = models.CharField(max_length=100, blank=True)
    gstin = models.CharField(max_length=20, blank=True)

    create_ledger = models.BooleanField(default=True)
    opening_balance = models.FloatField(default=0)
    balance_type = models.CharField(max_length=100, blank=True)
    due_in_days_type = models.CharField(max_length=100, blank=True)

    region_name = models.CharField(max_length=255, blank=True)
    area_name = models.CharField(max_length=255, blank=True)
    route = models.CharField(max_length=255, blank=True)

    # Kept as free-form strings ("28-Jul-2026") to match the format the Angular form sends.
    from_date = models.CharField(max_length=50, blank=True)
    to_date = models.CharField(max_length=50, blank=True)
    active = models.BooleanField(default=True)

    transactions = models.CharField(max_length=100, blank=True)
    serviced_by = models.CharField(max_length=255, blank=True)
    smart_tags = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.name
