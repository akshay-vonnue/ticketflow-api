# IMPACT ANALYSIS

# update function for ticket

### The system's update feature for updating tickets runs on a single update function,so there are two endpoints "update" and "change_status" that works on this same functionality.

### Adding a transaction for logging status history to the update function may triggers logging on other ticket updates too.


# SYSTEM FLOW

## router :
    validate the request's body,parameters,query...
## controller
    extract data from the req and passes them to the service layer.
## service
    validate the user permissions and handle business logic
## repository
    handles the db operations using prisma.

